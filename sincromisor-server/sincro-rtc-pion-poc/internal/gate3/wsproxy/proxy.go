package wsproxy

import (
	"context"
	"fmt"
	"net"
	"net/http"

	"github.com/coder/websocket"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func (s *Set) serve(proxy *proxy, response http.ResponseWriter, request *http.Request) {
	if s.rejectUpgrade(proxy.service) {
		response.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	downstream, err := websocket.Accept(response, request, nil)
	if err != nil {
		s.record(fmt.Errorf("%w: accept downstream %s: %v", ErrProtocol, proxy.service, err))
		return
	}
	defer downstream.CloseNow()
	upstreamURL := "ws://" + net.JoinHostPort(proxy.upstream.Host, fmt.Sprint(proxy.upstream.Port)) + request.URL.RequestURI()
	upstream, _, err := websocket.Dial(s.ctx, upstreamURL, nil)
	if err != nil {
		s.record(fmt.Errorf("%w: dial upstream %s: %v", ErrProtocol, proxy.service, err))
		return
	}
	defer upstream.CloseNow()

	s.connectionOpened(proxy.service)
	defer s.connectionClosed(proxy.service)
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	if proxy.service == discovery.ServiceExtractor {
		// Extractor 初期化は一方向の接続 preface で request/response 交換ではない。
		// generation 再接続時にも armed rule を消費せず、その後の PCM attempt を障害対象に保つ。
		messageType, initialize, readErr := downstream.Read(ctx)
		if readErr != nil {
			return
		}
		if messageType != websocket.MessageBinary {
			s.record(fmt.Errorf("%w: extractor initialize must be binary", ErrProtocol))
			return
		}
		if err := upstream.Write(ctx, messageType, initialize); err != nil {
			return
		}
	}
	for {
		messageType, requestPayload, readErr := downstream.Read(ctx)
		if readErr != nil {
			return
		}
		if messageType != websocket.MessageBinary {
			s.record(fmt.Errorf("%w: %s request must be binary", ErrProtocol, proxy.service))
			return
		}
		action := s.beginExchange(proxy.service)
		if err := upstream.Write(ctx, messageType, requestPayload); err != nil {
			s.finishExchange(proxy.service)
			return
		}
		if action == ActionClose {
			s.finishFault(proxy.service)
			return
		}
		responseType, responsePayload, responseErr := upstream.Read(ctx)
		if responseErr != nil {
			s.finishExchange(proxy.service)
			return
		}
		switch action {
		case ActionMalformed:
			s.finishFault(proxy.service)
			if err := downstream.Write(ctx, websocket.MessageBinary, []byte{0xc1}); err != nil {
				return
			}
			return
		case ActionHeldClose:
			s.finishFault(proxy.service)
			return
		default:
			s.finishExchange(proxy.service)
			if err := downstream.Write(ctx, responseType, responsePayload); err != nil {
				return
			}
		}
	}
}

func (s *Set) rejectUpgrade(service discovery.Service) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := s.state[service]
	if state.rejects == 0 {
		return false
	}
	state.rejects--
	return true
}

func (s *Set) connectionOpened(service discovery.Service) {
	s.mu.Lock()
	state := s.state[service]
	state.counts.Accepted++
	state.counts.Active++
	s.mu.Unlock()
}

func (s *Set) connectionClosed(service discovery.Service) {
	s.mu.Lock()
	state := s.state[service]
	state.counts.Active--
	state.counts.Closed++
	s.mu.Unlock()
}

// beginExchange は規則先頭の service が arm 後の最初の request を受けた場合だけ消費する。
// 他 service は透過を維持し、規則順を入れ替えない。
func (s *Set) beginExchange(service discovery.Service) Action {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := s.state[service]
	state.requestsInFlight++
	if len(s.rules) == 0 || s.rules[0].Service != service {
		return ""
	}
	rule := s.rules[0]
	s.rules = s.rules[1:]
	return rule.Action
}

func (s *Set) finishExchange(service discovery.Service) {
	s.mu.Lock()
	state := s.state[service]
	state.requestsInFlight--
	state.completed++
	s.mu.Unlock()
}

func (s *Set) finishFault(service discovery.Service) {
	s.mu.Lock()
	state := s.state[service]
	state.requestsInFlight--
	state.rejects = 1
	s.mu.Unlock()
}
