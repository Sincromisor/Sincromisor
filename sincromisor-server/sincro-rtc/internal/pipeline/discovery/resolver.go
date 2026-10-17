// Package discovery は、audio pipeline worker の接続先を Consul または共通 fallback から解決する。
//
// この package は接続や再試行を行わない。返した Endpoint の Source と FallbackReason により、
// caller は payload や credential を記録せずに縮退理由を観測できる。
package discovery

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxConsulResponseBytes int64 = 1 << 20

// Service は Consul lookup を許可する audio pipeline service 名である。
type Service string

const (
	// ServiceExtractor は SpeechExtractor の discovery 名である。
	ServiceExtractor Service = "SpeechExtractor"
	// ServiceRecognizer は SpeechRecognizer の discovery 名である。
	ServiceRecognizer Service = "SpeechRecognizer"
	// ServiceProcessor は TextProcessor の discovery 名である。
	ServiceProcessor Service = "TextProcessor"
	// ServiceSynthesizer は VoiceSynthesizer の discovery 名である。
	ServiceSynthesizer Service = "VoiceSynthesizer"
)

// EndpointSource は接続先が Consul と fallback のどちらから得られたかを表す。
type EndpointSource string

const (
	// EndpointSourceConsul は passing worker が選択されたことを表す。
	EndpointSourceConsul EndpointSource = "consul"
	// EndpointSourceFallback は共通 fallback が選択されたことを表す。
	EndpointSourceFallback EndpointSource = "fallback"
)

// FallbackReason は Consul を使えなかった分類可能な理由である。
type FallbackReason string

const (
	// FallbackReasonConsulDisabled は base URL が未設定だったことを表す。
	FallbackReasonConsulDisabled FallbackReason = "consul_disabled"
	// FallbackReasonTimeout は探索の時間切れを表す。
	FallbackReasonTimeout FallbackReason = "timeout"
	// FallbackReasonConnectionFailed はHTTP接続または読取の失敗を表す。
	FallbackReasonConnectionFailed FallbackReason = "connection_failed"
	// FallbackReasonHTTPFailure はHTTP異常状態や拒否したリダイレクトを表す。
	FallbackReasonHTTPFailure FallbackReason = "http_failure"
	// FallbackReasonInvalidResponse は破損・上限超過・不正候補を表す。
	FallbackReasonInvalidResponse FallbackReason = "invalid_response"
	// FallbackReasonNoHealthyInstance は passing worker が0件だったことを表す。
	FallbackReasonNoHealthyInstance FallbackReason = "no_healthy_instance"
)

// Endpoint は validation 済みの host/port と、その解決元を返す。
//
// Host は scheme や path を含まない。Source が consul の場合 FallbackReason は空であり、
// fallback の場合は縮退理由が必ず設定される。
type Endpoint struct {
	Host           string
	Port           uint16
	Source         EndpointSource
	FallbackReason FallbackReason
	// HTTPStatusは応答がない場合0、Durationは探索の単調時計による経過時間である。
	HTTPStatus int
	Duration   time.Duration
}

// Resolver は service ごとに1回の接続先解決を行う。
//
// 実装は接続、cache、watch、retry を所有しない。caller は返された source を観測した後、
// 自身の connection lifecycle 内で Endpoint を使用する。
type Resolver interface {
	Resolve(ctx context.Context, service Service) (Endpoint, error)
}

// ResolverConfig は Consul lookup と4 service共通 fallback の境界設定である。
//
// ConsulBaseURL の空文字は意図的な無効化を表し、設定する場合は安全な http(s) origin のみを許可する。
// RequestTimeoutはconstructorで検証し、fallbackは実際に必要になったResolveでservice名付きerrorへ変換する。
type ResolverConfig struct {
	ConsulBaseURL  string
	FallbackHost   string
	FallbackPort   uint16
	RequestTimeout time.Duration
}

type resolver struct {
	baseURL  *url.URL
	fallback Endpoint
	timeout  time.Duration
	client   *http.Client
	choose   func(int) (int, error)
}

type consulEntry struct {
	Service struct {
		Address string `json:"Address"`
		Port    int    `json:"Port"`
	} `json:"Service"`
}

var errRedirectRejected = errors.New("consul redirect rejected")

// NewResolver は設定だけを検証し、network I/Oを行わない Resolver を返す。
//
// 注入 client は transport と timeout policy を再利用するが、CheckRedirect は必ず上書きして
// credential の別 origin 転送を防ぐ。nil chooser は crypto/rand による一様選択を使う。
// Consul URL の構文不正は起動時errorとし、fallback不正はfallbackが必要になったResolveで対象serviceと共に返す。
func NewResolver(cfg ResolverConfig, client *http.Client, choose func(int) (int, error)) (Resolver, error) {
	if cfg.RequestTimeout <= 0 {
		return nil, errors.New("discovery request timeout must be positive")
	}

	baseURL, err := validateBaseURL(cfg.ConsulBaseURL)
	if err != nil {
		return nil, err
	}
	if client == nil {
		client = &http.Client{}
	} else {
		copy := *client
		client = &copy
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		return errRedirectRejected
	}
	if choose == nil {
		choose = cryptoChoose
	}
	return &resolver{
		baseURL: baseURL,
		fallback: Endpoint{
			Host:   cfg.FallbackHost,
			Port:   cfg.FallbackPort,
			Source: EndpointSourceFallback,
		},
		timeout: cfg.RequestTimeout,
		client:  client,
		choose:  choose,
	}, nil
}

// Resolve は passing instance を一様選択し、Consul が利用不能なら共通 fallback を返す。
//
// 未設定 Consul、lookup failure（worker endpoint不正を含む）、0件は Endpoint.FallbackReason で区別する。
// 未知service、fallback不正、chooserの契約違反だけをerrorとして返し、response body、service payload、
// credentialはerrorに含めない。
func (r *resolver) Resolve(ctx context.Context, service Service) (endpoint Endpoint, err error) {
	started := time.Now()
	defer func() { endpoint.Duration = time.Since(started) }()
	if !validService(service) {
		return Endpoint{}, fmt.Errorf("resolve service %q: unsupported service", service)
	}
	if r.baseURL == nil {
		return r.fallbackEndpoint(service, FallbackReasonConsulDisabled)
	}

	entries, reason, status := r.lookup(ctx, service)
	if reason != "" {
		endpoint, err := r.fallbackEndpoint(service, reason)
		endpoint.HTTPStatus = status
		return endpoint, err
	}
	index, err := r.choose(len(entries))
	if err != nil || index < 0 || index >= len(entries) {
		return Endpoint{}, fmt.Errorf("resolve service %s: choose healthy instance", service)
	}
	entry := entries[index].Service
	return Endpoint{
		Host:   entry.Address,
		Port:   uint16(entry.Port),
		Source: EndpointSourceConsul,
	}, nil
}

// lookup は既存のサイズ・候補・転送先制約を維持し、応答本文を返さず探索失敗を分類する。
func (r *resolver) lookup(ctx context.Context, service Service) ([]consulEntry, FallbackReason, int) {
	requestURL := *r.baseURL
	requestURL.Path = "/v1/health/service/" + url.PathEscape(string(service))
	requestURL.RawQuery = url.Values{"passing": {"true"}}.Encode()
	requestCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return nil, FallbackReasonInvalidResponse, 0
	}
	response, err := r.client.Do(request)
	if err != nil {
		if errors.Is(err, errRedirectRejected) {
			status := 0
			if response != nil {
				status = response.StatusCode
			}
			return nil, FallbackReasonHTTPFailure, status
		}
		return nil, lookupFailureReason(err), 0
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, FallbackReasonHTTPFailure, response.StatusCode
	}

	reader := io.LimitReader(response.Body, maxConsulResponseBytes+1)
	payload, err := io.ReadAll(reader)
	if err != nil {
		return nil, lookupFailureReason(err), response.StatusCode
	}
	if int64(len(payload)) > maxConsulResponseBytes {
		return nil, FallbackReasonInvalidResponse, response.StatusCode
	}
	var entries []consulEntry
	if err := json.Unmarshal(payload, &entries); err != nil {
		return nil, FallbackReasonInvalidResponse, response.StatusCode
	}
	if len(entries) == 0 {
		return nil, FallbackReasonNoHealthyInstance, response.StatusCode
	}
	for _, entry := range entries {
		if err := validateHost(entry.Service.Address); err != nil ||
			entry.Service.Port < 1 || entry.Service.Port > 65535 {
			return nil, FallbackReasonInvalidResponse, response.StatusCode
		}
	}
	return entries, "", response.StatusCode
}

// lookupFailureReason はURLやHTTP本文を読まず、通信失敗と時間切れだけを分類する。
func lookupFailureReason(err error) FallbackReason {
	var netError net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &netError) && netError.Timeout() {
		return FallbackReasonTimeout
	}
	return FallbackReasonConnectionFailed
}

func (r *resolver) fallbackEndpoint(service Service, reason FallbackReason) (Endpoint, error) {
	if err := validateHost(r.fallback.Host); err != nil || r.fallback.Port == 0 {
		return Endpoint{}, fmt.Errorf("resolve service %s: fallback endpoint is missing or invalid", service)
	}
	result := r.fallback
	result.FallbackReason = reason
	return result, nil
}

func validateBaseURL(raw string) (*url.URL, error) {
	if raw == "" {
		return nil, nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") ||
		parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.Path != "" && parsed.Path != "/") {
		return nil, errors.New("discovery consul base URL must be an http(s) origin without credentials, query, or fragment")
	}
	if parsed.Hostname() == "" {
		return nil, errors.New("discovery consul base URL must have a non-empty authority")
	}
	parsed.Path = ""
	return parsed, nil
}

func validateHost(host string) error {
	if host == "" || strings.TrimSpace(host) != host ||
		strings.ContainsAny(host, "/?#@") {
		return errors.New("host must not be empty or contain URL components")
	}
	if net.ParseIP(strings.Trim(host, "[]")) != nil {
		return nil
	}
	if strings.Contains(host, ":") {
		return errors.New("host must not contain a port or scheme")
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return errors.New("host has an invalid DNS label")
		}
		for _, character := range label {
			if (character < 'a' || character > 'z') &&
				(character < 'A' || character > 'Z') &&
				(character < '0' || character > '9') && character != '-' {
				return errors.New("host has an invalid DNS character")
			}
		}
	}
	return nil
}

func validService(service Service) bool {
	switch service {
	case ServiceExtractor, ServiceRecognizer, ServiceProcessor, ServiceSynthesizer:
		return true
	default:
		return false
	}
}

func cryptoChoose(count int) (int, error) {
	if count <= 0 {
		return 0, errors.New("choice count must be positive")
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(count)))
	if err != nil {
		return 0, fmt.Errorf("choose random healthy instance: %w", err)
	}
	return int(value.Int64()), nil
}
