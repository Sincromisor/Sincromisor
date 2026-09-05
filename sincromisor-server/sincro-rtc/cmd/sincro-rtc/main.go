// Command sincro-rtc は構築済みフロントエンドとPionのRTCサービスを同一オリジンで提供する。
package main

import (
	"fmt"
	"os"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "sincro-rtc: %v\n", err)
		os.Exit(1)
	}
}

// run は本番用のFFmpeg実行処理とHTTP提供を起動処理へ渡す。
// 設定と依存の検証はrunWithBoundaries、通信の提供と終了はserveが担当し、失敗はmainへ返す。
func run(args []string) error {
	return runWithBoundaries(args, synthdecode.ExecRunner{}, serve)
}
