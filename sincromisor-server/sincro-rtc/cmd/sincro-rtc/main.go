// Command sincro-rtc は build 済みFrontendとPion signaling/media serviceを同一originで起動する。
package main

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

const (
	// shutdownCleanupTimeout はOffer ownerと全sessionが共有するcleanup contextの期限である。
	// 短くすると正常なresource解放までdeadline errorになり、長くするとHTTP停止と合わせたprocess終了上限が延びる。
	// 変更時はPion README、rollout運用文書、shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownCleanupTimeout = 5 * time.Second
	// shutdownAdmissionWindow はdrainingとinitial Offer 503を観測させるためlistenerを維持する時間である。
	// 短くすると外部監督が503を見逃し、長くするとcleanupが早い場合のHTTP停止を遅らせる。
	// cleanup期限を超える値は観測窓自体をdeadline errorにする。変更時はPion README、rollout運用文書、
	// shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownAdmissionWindow = 1 * time.Second
	// shutdownHTTPTimeout はcleanupと観測窓の完了後にhttp.Serverだけを停止する独立期限である。
	// 短くすると接続終了がdeadline errorになり、長くするとprocess終了上限がcleanup期限との合計6秒を超える。
	// 変更時はPion README、rollout運用文書、shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownHTTPTimeout = 1 * time.Second
	// discoveryRequestTimeout は local Consul 障害が readiness 後のsession cleanupを長時間妨げない上限である。
	discoveryRequestTimeout = 2 * time.Second
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "sincro-rtc: %v\n", err)
		os.Exit(1)
	}
}

// run は config load、HTTP serve、signal shutdown を 1 つの process lifecycle として調停する。
//
// SIGINT / SIGTERMではdrainingを先に公開し、1秒間initial Offerを503で拒否できるlistenerを維持する。
// その間にprocess context、Offer owner、全sessionを共通期限で収束させ、最後にHTTPを停止する。
// listener起動失敗を含むshutdown failureはmainへ返し、下位packageでは終了しない。
func run(args []string) error {
	return runWithBoundaries(args, synthdecode.ExecRunner{}, serve)
}

// serveBoundaryは検証済みstartup resourceからHTTP listener lifecycleへ移る最後の境界である。
func logListenerReady(logger *slog.Logger, goroutineCount int) {
	logger.Info("sincro-rtc listening", "stage", "listener_ready", "count", goroutineCount)
}

func logShutdownRequested(logger *slog.Logger) {
	logger.Info("shutdown signal received", "reason", "process_shutdown")
}

func logShutdownComplete(logger *slog.Logger, activeSessionCount int) {
	logger.Info("sincro-rtc stopped", "stage", "shutdown_complete", "count", activeSessionCount)
}
