package main

import (
	"context"
	"crypto/sha256"
)

// consulCheckは認証やチェック定義を復号せず、実ノードと結果だけを受け取る。
type consulCheck struct{ Node, CheckID, ServiceID, ServiceName, Status, Output string }

// consulChecksは各ローカルagentの結果を優先する。同一状態でのOutput変更は
// catalogへの同期が遅れるため、全ホストにある補助収集から直接観測する。
func (o *observer) consulChecks(ctx context.Context) error {
	localNodes := map[string]bool{}
	var queryErr error
	for agent := range o.localAgents {
		var checks map[string]consulCheck
		err := get(ctx, o.consul, "http://"+agent+":8500/v1/agent/checks", &checks)
		o.failure("consul_agent:"+agent, err)
		if err != nil {
			queryErr = err
			continue
		}
		for _, check := range checks {
			localNodes[check.Node] = true
			o.consulCheck(check)
		}
	}
	// catalogは実ノードの全体状態も補う。ローカルの新しいOutputを古い値で戻さない。
	var checks []consulCheck
	if err := get(ctx, o.consul, o.consulURL+"/v1/health/state/any", &checks); err != nil {
		return err
	}
	for _, check := range checks {
		if !localNodes[check.Node] {
			o.consulCheck(check)
		}
	}
	return queryErr
}

// consulCheckは任意出力の変化も内部だけで比較し、原文とハッシュをログへ出さない。
func (o *observer) consulCheck(c consulCheck) {
	diagnostic, truncated := diagnosis(c.Output)
	key := "consul:" + c.Node + ":" + c.CheckID
	digest := sha256.Sum256([]byte(c.Output))
	if o.inputs[key] != digest {
		delete(o.previous, key)
	}
	o.inputs[key] = digest
	o.changed(key, map[string]any{"event": "consul_check", "target_node": c.Node, "target_service": c.ServiceName, "service_id": c.ServiceID, "check_id": c.CheckID, "status": c.Status, "diagnostic": diagnostic, "diagnostic_truncated": truncated})
}
