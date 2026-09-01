package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type shutdownOperations struct {
	BeginDrain          func()
	Deregister          func(context.Context) error
	CancelProcess       func()
	WaitOffers          func(context.Context) error
	CloseSessions       func(context.Context, string) error
	ShutdownHTTP        func(context.Context) error
	WaitAdmissionWindow func(context.Context) error
}

// shutdownProcessはdraining観測窓とprocess cleanupを完了してからHTTP listenerを停止する。
//
// BeginDrainは最初に実行し、CancelProcess、Offer owner join、session closeはsignal後の共通5秒期限で
// 収束させる。cleanupが早く終わっても1秒の受付拒否観測窓は短縮せず、両方の完了後に独立した
// 1秒期限でHTTPを停止する。各段階の失敗はerrors.Joinで保持し、未join resourceを正常終了にしない。
func shutdownProcess(operations shutdownOperations) error {
	operations.BeginDrain()
	cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), shutdownCleanupTimeout)
	operations.CancelProcess()
	deregister := operations.Deregister
	if deregister == nil {
		deregister = func(context.Context) error { return nil }
	}

	cleanupErrors := make(chan error, 3)
	go func() {
		deregisterCtx, cancelDeregister := context.WithTimeout(context.Background(), 2*time.Second)
		err := deregister(deregisterCtx)
		cancelDeregister()
		if err != nil {
			err = fmt.Errorf("deregister Consul service: %w", err)
		}
		cleanupErrors <- err
	}()
	go func() {
		err := operations.WaitOffers(cleanupCtx)
		if err != nil {
			err = fmt.Errorf("wait offers: %w", err)
		}
		cleanupErrors <- err
	}()
	go func() {
		err := operations.CloseSessions(cleanupCtx, "process_shutdown")
		if err != nil {
			err = fmt.Errorf("close sessions: %w", err)
		}
		cleanupErrors <- err
	}()

	admissionErr := operations.WaitAdmissionWindow(cleanupCtx)
	if admissionErr != nil {
		admissionErr = fmt.Errorf("wait admission window: %w", admissionErr)
	}
	firstCleanupErr := <-cleanupErrors
	secondCleanupErr := <-cleanupErrors
	thirdCleanupErr := <-cleanupErrors
	cancelCleanup()

	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), shutdownHTTPTimeout)
	httpErr := operations.ShutdownHTTP(httpCtx)
	cancelHTTP()
	if httpErr != nil {
		httpErr = fmt.Errorf("shutdown http: %w", httpErr)
	}

	return errors.Join(admissionErr, firstCleanupErr, secondCleanupErr, thirdCleanupErr, httpErr)
}

// waitShutdownAdmissionWindowはdraining responseを外部監督が観測できる1秒をlistener停止前に確保する。
//
// cleanup共通期限が先に失効した場合はそのerrorを返し、HTTP停止へ進んでも時間契約違反を隠さない。
func waitShutdownAdmissionWindow(ctx context.Context) error {
	timer := time.NewTimer(shutdownAdmissionWindow)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// serve はHTTP受理、signal待機、process cleanup、HTTP停止の所有順序を調停する。
//
// signal時だけlistenerを1秒維持してdrainingを公開する。listener失敗時は観測対象がないため待機せず、
// 同じcleanup経路でprocess ownerを収束させる。全errorはshutdownProcessと結合してrunへ返す。
