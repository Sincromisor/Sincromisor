// Package datachannel はフロントエンド向けDataChannelのJSON変換、送信キュー、送信抑制を所有する。
//
// RTCセッションは検証済みのtext_chとtelop_chをDispatcherへ接続するだけであり、
// Dispatcherはセッションのcontext取消またはCloseまで送信処理担当を動かして終了時に待ち合わせる。
package datachannel
