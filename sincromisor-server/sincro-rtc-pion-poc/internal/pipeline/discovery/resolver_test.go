package discovery

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestResolverSelectsPassingInstanceAndBuildsFixedRequest(t *testing.T) {
	var receivedPath, receivedQuery string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		receivedPath = request.URL.Path
		receivedQuery = request.URL.RawQuery
		writer.Header().Set("Content-Type", "application/json")
		fmt.Fprint(writer, `[
			{"Service":{"Address":"worker-a.local","Port":8001}},
			{"Service":{"Address":"127.0.0.2","Port":8002}}
		]`)
	}))
	defer server.Close()

	resolver := newTestResolver(t, ResolverConfig{
		ConsulBaseURL:  server.URL,
		FallbackHost:   "fallback.local",
		FallbackPort:   9000,
		RequestTimeout: time.Second,
	}, server.Client(), func(count int) (int, error) {
		if count != 2 {
			t.Fatalf("chooser count = %d, want 2", count)
		}
		return 1, nil
	})
	endpoint, err := resolver.Resolve(context.Background(), ServiceRecognizer)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if endpoint != (Endpoint{Host: "127.0.0.2", Port: 8002, Source: EndpointSourceConsul}) {
		t.Fatalf("Endpoint = %+v", endpoint)
	}
	if receivedPath != "/v1/health/service/SpeechRecognizer" || receivedQuery != "passing=true" {
		t.Fatalf("request = %s?%s", receivedPath, receivedQuery)
	}
}

func TestResolverFallbackReasonsRemainTyped(t *testing.T) {
	tests := []struct {
		name      string
		baseURL   string
		handler   http.Handler
		reason    FallbackReason
		useServer bool
	}{
		{name: "disabled", reason: FallbackReasonConsulDisabled},
		{
			name: "no healthy instance",
			handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				fmt.Fprint(writer, `[]`)
			}),
			reason:    FallbackReasonNoHealthyInstance,
			useServer: true,
		},
		{
			name: "server failure",
			handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				http.Error(writer, "sensitive response", http.StatusInternalServerError)
			}),
			reason:    FallbackReasonRequestFailed,
			useServer: true,
		},
		{
			name: "invalid body",
			handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				fmt.Fprint(writer, `{not-json}`)
			}),
			reason:    FallbackReasonRequestFailed,
			useServer: true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var server *httptest.Server
			baseURL := test.baseURL
			var client *http.Client
			if test.useServer {
				server = httptest.NewServer(test.handler)
				defer server.Close()
				baseURL = server.URL
				client = server.Client()
			}
			resolver := newTestResolver(t, ResolverConfig{
				ConsulBaseURL:  baseURL,
				FallbackHost:   "fallback.local",
				FallbackPort:   9000,
				RequestTimeout: time.Second,
			}, client, nil)
			endpoint, err := resolver.Resolve(context.Background(), ServiceExtractor)
			if err != nil {
				t.Fatalf("Resolve() error = %v", err)
			}
			want := Endpoint{
				Host:           "fallback.local",
				Port:           9000,
				Source:         EndpointSourceFallback,
				FallbackReason: test.reason,
			}
			if endpoint != want {
				t.Fatalf("Endpoint = %+v, want %+v", endpoint, want)
			}
		})
	}
}

func TestResolverRejectsRedirectForInjectedHTTPClient(t *testing.T) {
	targetReached := false
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		targetReached = true
	}))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		http.Redirect(writer, request, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	injected := redirect.Client()
	injected.CheckRedirect = func(*http.Request, []*http.Request) error {
		return nil
	}
	resolver := newTestResolver(t, ResolverConfig{
		ConsulBaseURL:  redirect.URL,
		FallbackHost:   "fallback.local",
		FallbackPort:   9000,
		RequestTimeout: time.Second,
	}, injected, nil)
	endpoint, err := resolver.Resolve(context.Background(), ServiceProcessor)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if endpoint.FallbackReason != FallbackReasonRequestFailed {
		t.Fatalf("FallbackReason = %q", endpoint.FallbackReason)
	}
	if targetReached {
		t.Fatal("injected HTTP client followed redirect")
	}
}

func TestNewResolverValidatesOriginsFallbackAndTimeout(t *testing.T) {
	invalidURLs := []string{
		"ftp://consul.local", "http:///missing", "http://user:pass@consul.local",
		"http://consul.local/path", "http://consul.local?q=x", "http://consul.local#fragment",
	}
	for _, raw := range invalidURLs {
		t.Run(raw, func(t *testing.T) {
			_, err := NewResolver(ResolverConfig{
				ConsulBaseURL:  raw,
				FallbackHost:   "fallback.local",
				FallbackPort:   9000,
				RequestTimeout: time.Second,
			}, nil, nil)
			if err == nil {
				t.Fatal("NewResolver() succeeded")
			}
			if strings.Contains(err.Error(), "user:pass") {
				t.Fatalf("error leaked credential: %v", err)
			}
		})
	}
	if _, err := NewResolver(ResolverConfig{
		FallbackHost: "fallback.local", FallbackPort: 9000, RequestTimeout: 0,
	}, nil, nil); err == nil {
		t.Fatal("NewResolver() accepted zero timeout")
	}
	for _, cfg := range []ResolverConfig{
		{FallbackHost: "http://bad", FallbackPort: 9000, RequestTimeout: time.Second},
		{FallbackHost: "fallback.local", FallbackPort: 0, RequestTimeout: time.Second},
	} {
		resolver := newTestResolver(t, cfg, nil, nil)
		_, err := resolver.Resolve(context.Background(), ServiceExtractor)
		if err == nil || !strings.Contains(err.Error(), string(ServiceExtractor)) {
			t.Fatalf("Resolve() error = %v, want service-specific fallback error", err)
		}
	}
}

func TestResolverRejectsOversizedBodyAndInvalidWorkerWithoutLeakingPayload(t *testing.T) {
	t.Run("oversized body falls back", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			fmt.Fprint(writer, strings.Repeat("x", int(maxConsulResponseBytes)+1))
		}))
		defer server.Close()
		resolver := newTestResolver(t, ResolverConfig{
			ConsulBaseURL: server.URL, FallbackHost: "fallback.local",
			FallbackPort: 9000, RequestTimeout: time.Second,
		}, server.Client(), nil)
		endpoint, err := resolver.Resolve(context.Background(), ServiceSynthesizer)
		if err != nil || endpoint.FallbackReason != FallbackReasonRequestFailed {
			t.Fatalf("Resolve() = %+v, %v", endpoint, err)
		}
	})

	t.Run("invalid worker falls back without payload leak", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			fmt.Fprint(writer, `[{"Service":{"Address":"http://secret.invalid/path","Port":70000}}]`)
		}))
		defer server.Close()
		resolver := newTestResolver(t, ResolverConfig{
			ConsulBaseURL: server.URL, FallbackHost: "fallback.local",
			FallbackPort: 9000, RequestTimeout: time.Second,
		}, server.Client(), func(int) (int, error) { return 0, nil })
		endpoint, err := resolver.Resolve(context.Background(), ServiceSynthesizer)
		if err != nil {
			t.Fatalf("Resolve() error = %v", err)
		}
		if endpoint.FallbackReason != FallbackReasonRequestFailed {
			t.Fatalf("FallbackReason = %q", endpoint.FallbackReason)
		}
	})
}

func newTestResolver(
	t *testing.T,
	cfg ResolverConfig,
	client *http.Client,
	choose func(int) (int, error),
) Resolver {
	t.Helper()
	resolver, err := NewResolver(cfg, client, choose)
	if err != nil {
		t.Fatalf("NewResolver() error = %v", err)
	}
	return resolver
}
