// Package process はRTC統合試験が起動する子プロセスの生存期間と、保持量を制限した出力を所有する。
//
// Ownerは一度だけStartでき、Waitの呼び出し元の時間切れと子プロセスの後始末を分離する。
// CloseはSIGTERM、猶予後のSIGKILL、バックグラウンド待機処理の終了待ちを完了させる。
package process
