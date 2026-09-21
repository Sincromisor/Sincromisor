# 実装時の確認記録

## 実環境への反映

`consul-agent-chat` の再作成とbandogの再起動を行った。
両サービスのローカル死活確認はpassingだが、Consulサーバーへの
`Catalog.Register` が `rpc error making call: EOF` となり、AgentServerの状態がcriticalのまま残った。
サーバーログにも `server cannot decode request: i/o deadline reached` があり、bandogは失敗件数1を報告した。
設定再読込では復旧しなかったが、対象エージェントの再起動後は両サービスのDNS応答が復旧した。
会話サービス本体の再起動や認証・接続設定の変更は行っていない。
RPC切断そのものの原因は今回の監視追加では解消しておらず、再発時はConsulの通信経路を調査する。
