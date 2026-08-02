package wsproxy

import (
	"errors"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

var (
	// ErrProtocol は不正な endpoint、規則、WebSocket frame を分類する。
	ErrProtocol = errors.New("websocket proxy protocol violation")
	// ErrArmConflict は現在の有限状態を規則で置換できないことを表す。
	ErrArmConflict = errors.New("websocket proxy arm conflict")
	// ErrRuleUnconsumed は scenario 終了時に規則または拒否回数が残ったことを表す。
	ErrRuleUnconsumed = errors.New("websocket proxy rule was not consumed")
)

// Action は server response 境界の固定障害語彙である。
type Action string

const (
	// ActionClose は一致 request を上流へ渡した後、response を配信する前に閉じる。
	ActionClose Action = "close"
	// ActionMalformed は一致した上流 response を不正 MessagePack へ置換する。
	ActionMalformed Action = "malformed"
	// ActionHeldClose は一致した有効 response を読み取って破棄してから閉じる。
	ActionHeldClose Action = "held-close"
)

// Rule は有限な交換障害1件を表す。ordinal 1 と reconnect 拒否1回だけを受理し、
// scenario が暗黙に対象を広げることを防ぐ。
type Rule struct {
	// Service は fault を消費する request/response 境界である。
	Service discovery.Service
	// Action は response 配信に適用する有限障害である。
	Action Action
	// MatchOrdinal は arm 後の最初の交換を表す1だけを許す。
	MatchOrdinal int
	// RejectReconnects は fault 後の WebSocket upgrade 拒否1回だけを許す。
	RejectReconnects int
}

// Config は過不足ない4 upstream 契約 endpoint を渡す。
type Config struct {
	// Upstreams は4契約 service の loopback endpoint である。
	Upstreams map[discovery.Service]discovery.Endpoint
	// ListenHost は省略時 127.0.0.1 となる loopback IP address である。
	ListenHost string
}

// Counts は単調な upgrade 成功数と接続終了数、および現在の接続 gauge である。
// HTTP 503 拒否はどの field にも含めない。
type Counts struct {
	// Accepted は成功した WebSocket upgrade の累積数である。
	Accepted int64
	// Active は現在 join 前の proxy 接続数である。
	Active int64
	// Closed は proxy が終端を観測した接続の累積数である。
	Closed int64
}

// Ledger は service 別 proxy 観測値の point-in-time copy である。
type Ledger struct {
	// Connections は正規4 service の接続観測値である。
	Connections map[discovery.Service]Counts
}
