package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type processStatus struct {
	Sessions int  `json:"sessions"`
	Ready    bool `json:"ready"`
	Draining bool `json:"draining"`
}

// waitForHTTPReady は起動中の接続失敗を許容し、期限内の最初のHTTP 200を待つ。
func waitForHTTPReady(t *testing.T, url string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	client := &http.Client{Timeout: 200 * time.Millisecond}
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			t.Fatalf("create readiness request: %v", err)
		}
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		select {
		case <-ctx.Done():
			t.Fatalf("sincro-rtc HTTP did not become ready: %v", ctx.Err())
		case <-ticker.C:
		}
	}
}

func waitForDrainingStatus(
	t *testing.T,
	client *http.Client,
	baseURL string,
	deadline time.Time,
) processStatus {
	t.Helper()
	for time.Now().Before(deadline) {
		status, err := fetchProcessStatus(client, baseURL)
		if err == nil && status.Draining {
			return status
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("draining status was not observable before admission window closed")
	return processStatus{}
}

func waitForSessionCount(
	t *testing.T,
	client *http.Client,
	baseURL string,
	want int,
	deadline time.Time,
) {
	t.Helper()
	for time.Now().Before(deadline) {
		status, err := fetchProcessStatus(client, baseURL)
		if err == nil && status.Sessions == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("session count did not become %d before admission window closed", want)
}

func fetchProcessStatus(client *http.Client, baseURL string) (processStatus, error) {
	response, err := client.Get(baseURL + "/api/v1/RTCSignalingServer/statuses")
	if err != nil {
		return processStatus{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return processStatus{}, fmt.Errorf("statuses response: %s", response.Status)
	}
	var status processStatus
	if err := json.NewDecoder(response.Body).Decode(&status); err != nil {
		return processStatus{}, fmt.Errorf("decode statuses: %w", err)
	}
	return status, nil
}

func assertHTTPStatus(
	t *testing.T,
	client *http.Client,
	method string,
	url string,
	body string,
	want int,
) {
	t.Helper()
	request, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatalf("create %s request: %v", method, err)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("%s %s returned connection error, want HTTP %d: %v", method, url, want, err)
	}
	defer response.Body.Close()
	if response.StatusCode != want {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("%s %s status = %d, want %d; body=%s", method, url, response.StatusCode, want, payload)
	}
}

// waitForHTTPStopped は終了期限まで接続を試し、待受停止を接続失敗として確認する。
func waitForHTTPStopped(t *testing.T, client *http.Client, baseURL string, deadline time.Time) {
	t.Helper()
	for time.Now().Before(deadline) {
		response, err := client.Get(baseURL + "/health/live")
		if err != nil {
			return
		}
		_ = response.Body.Close()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("HTTP listener still accepted connections after shutdown")
}
