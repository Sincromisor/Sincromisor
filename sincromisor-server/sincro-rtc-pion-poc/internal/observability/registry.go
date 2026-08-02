// Package observability owns the process-local Prometheus registry and the
// finite-cardinality event vocabulary emitted by the RTC process.
package observability

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
)

// Recorder is the typed telemetry boundary shared by signaling and RTC
// lifecycles. Callers cannot create metrics or labels from payload data.
type Recorder interface {
	// SessionCreated acquires one active-session ownership unit.
	SessionCreated()
	// SessionClosed releases active ownership and records a normalized terminal result.
	SessionClosed(outcome, reason string)
	// SignalingRequest records a normalized endpoint/status pair and wall duration.
	SignalingRequest(endpoint, statusClass string, duration time.Duration)
	// ICETransition records a transition between finite Pion ICE states.
	ICETransition(from, to string)
	// Deadline records the finite lifecycle stage whose timer expired.
	Deadline(stage string)
	// AudioFrame records a payload-free input/output frame outcome.
	AudioFrame(direction, outcome string)
	// RTPDrop records a bounded ordering-drop reason.
	RTPDrop(reason string)
	// RTCPFeedback records a packet class without SSRC or report identity.
	RTCPFeedback(feedbackType string)
	// RTCPQuality observes Receiver Report loss ratio and optional RTT seconds.
	RTCPQuality(lossRatio, rttSeconds float64)
	// PacingLag observes positive outbound scheduler delay in seconds.
	PacingLag(seconds float64)
	// PacingAbort records why pending outbound audio was discarded.
	PacingAbort(reason string)
	// CodecError records one fixed decode or encode boundary failure.
	CodecError(direction string)
	// PipelineReconnect records start/success/failure for a fixed downstream service.
	PipelineReconnect(service, result string)
	// QueueDepthDelta transfers item ownership to or from a fixed queue.
	QueueDepthDelta(queue string, delta float64)
	// QueueOverflow records the bounded drop or reject policy selected at capacity.
	QueueOverflow(queue, action string)
	// DataChannelError records a text or telop send failure.
	DataChannelError(channel string)
	// CloseDuration observes session resource-join duration and deadline outcome.
	CloseDuration(outcome string, duration time.Duration)
}

type nopRecorder struct{}

func (nopRecorder) SessionCreated()                                {}
func (nopRecorder) SessionClosed(string, string)                   {}
func (nopRecorder) SignalingRequest(string, string, time.Duration) {}
func (nopRecorder) ICETransition(string, string)                   {}
func (nopRecorder) Deadline(string)                                {}
func (nopRecorder) AudioFrame(string, string)                      {}
func (nopRecorder) RTPDrop(string)                                 {}
func (nopRecorder) RTCPFeedback(string)                            {}
func (nopRecorder) RTCPQuality(float64, float64)                   {}
func (nopRecorder) PacingLag(float64)                              {}
func (nopRecorder) PacingAbort(string)                             {}
func (nopRecorder) CodecError(string)                              {}
func (nopRecorder) PipelineReconnect(string, string)               {}
func (nopRecorder) QueueDepthDelta(string, float64)                {}
func (nopRecorder) QueueOverflow(string, string)                   {}
func (nopRecorder) DataChannelError(string)                        {}
func (nopRecorder) CloseDuration(string, time.Duration)            {}

// Discard returns a concurrency-safe Recorder that intentionally drops every
// event. Production startup injects Registry; this fallback exists for focused
// component tests and callers that deliberately expose no metrics endpoint.
func Discard() Recorder { return nopRecorder{} }

// Registry owns a private Prometheus registry. It deliberately does not
// register with the global default registry, so tests and multiple process
// instances cannot leak collectors into one another.
type Registry struct {
	registry *prometheus.Registry

	sessionsCreated  prometheus.Counter
	sessionsActive   prometheus.Gauge
	sessionsClosed   *prometheus.CounterVec
	signalingCount   *prometheus.CounterVec
	signalingLatency *prometheus.HistogramVec
	iceTransitions   *prometheus.CounterVec
	deadlines        *prometheus.CounterVec
	audioFrames      *prometheus.CounterVec
	rtpDrops         *prometheus.CounterVec
	rtcpFeedback     *prometheus.CounterVec
	rtcpLoss         prometheus.Histogram
	rtcpRTT          prometheus.Histogram
	pacingLag        prometheus.Histogram
	pacingAborts     *prometheus.CounterVec
	codecErrors      *prometheus.CounterVec
	reconnects       *prometheus.CounterVec
	queueDepth       *prometheus.GaugeVec
	queueOverflows   *prometheus.CounterVec
	dataChannelError *prometheus.CounterVec
	closeDuration    *prometheus.HistogramVec
}

// NewRegistry builds an isolated registry containing exactly the Gate 3 metric
// families. It performs no I/O and never mutates Prometheus' global registry.
func NewRegistry() *Registry {
	r := &Registry{registry: prometheus.NewRegistry()}
	r.sessionsCreated = prometheus.NewCounter(prometheus.CounterOpts{Name: "sincro_rtc_sessions_created_total", Help: "RTC sessions admitted by the process."})
	r.sessionsActive = prometheus.NewGauge(prometheus.GaugeOpts{Name: "sincro_rtc_sessions_active", Help: "RTC sessions currently owned by the process."})
	r.sessionsClosed = counterVec("sincro_rtc_sessions_closed_total", "Completed RTC session lifecycles.", "outcome", "reason")
	r.signalingCount = counterVec("sincro_rtc_signaling_requests_total", "Signaling requests by endpoint and status class.", "endpoint", "status_class")
	r.signalingLatency = histogramVec("sincro_rtc_signaling_duration_seconds", "Signaling request duration in seconds.", []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5}, "endpoint")
	r.iceTransitions = counterVec("sincro_rtc_ice_transitions_total", "Pion ICE state transitions.", "from", "to")
	r.deadlines = counterVec("sincro_rtc_deadlines_total", "Expired RTC lifecycle deadlines.", "stage")
	r.audioFrames = counterVec("sincro_rtc_audio_frames_total", "Audio frame outcomes.", "direction", "outcome")
	r.rtpDrops = counterVec("sincro_rtc_rtp_drops_total", "RTP ordering drops.", "reason")
	r.rtcpFeedback = counterVec("sincro_rtc_rtcp_feedback_total", "RTCP packet classifications.", "type")
	r.rtcpLoss = histogram("sincro_rtc_rtcp_loss_ratio", "RTCP reported loss ratio.", []float64{0, .001, .01, .05, .1, .25, .5, 1})
	r.rtcpRTT = histogram("sincro_rtc_rtcp_rtt_seconds", "RTCP round-trip time in seconds.", []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5})
	r.pacingLag = histogram("sincro_rtc_pacing_lag_seconds", "Outbound pacing lag in seconds.", []float64{.001, .005, .01, .02, .05, .1, .25, .5, 1})
	r.pacingAborts = counterVec("sincro_rtc_pacing_aborts_total", "Outbound pacing aborts.", "reason")
	r.codecErrors = counterVec("sincro_rtc_codec_errors_total", "Codec failures.", "direction")
	r.reconnects = counterVec("sincro_rtc_pipeline_reconnects_total", "Pipeline reconnect attempts and results.", "service", "result")
	r.queueDepth = gaugeVec("sincro_rtc_queue_depth", "Current queue occupancy in items.", "queue")
	r.queueOverflows = counterVec("sincro_rtc_queue_overflows_total", "Queue overflow actions.", "queue", "action")
	r.dataChannelError = counterVec("sincro_rtc_datachannel_send_errors_total", "DataChannel send errors.", "channel")
	r.closeDuration = histogramVec("sincro_rtc_session_close_duration_seconds", "Session close duration in seconds.", []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5}, "outcome")
	r.registry.MustRegister(
		r.sessionsCreated, r.sessionsActive, r.sessionsClosed, r.signalingCount, r.signalingLatency,
		r.iceTransitions, r.deadlines, r.audioFrames, r.rtpDrops, r.rtcpFeedback, r.rtcpLoss, r.rtcpRTT,
		r.pacingLag, r.pacingAborts, r.codecErrors, r.reconnects, r.queueDepth, r.queueOverflows,
		r.dataChannelError, r.closeDuration,
	)
	return r
}

func counterVec(name, help string, labels ...string) *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{Name: name, Help: help}, labels)
}
func gaugeVec(name, help string, labels ...string) *prometheus.GaugeVec {
	return prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: name, Help: help}, labels)
}
func histogram(name, help string, buckets []float64) prometheus.Histogram {
	return prometheus.NewHistogram(prometheus.HistogramOpts{Name: name, Help: help, Buckets: buckets})
}
func histogramVec(name, help string, buckets []float64, labels ...string) *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: name, Help: help, Buckets: buckets}, labels)
}

// Handler serves only collectors owned by this Registry in Prometheus text
// format. Scraping is read-only and cannot introduce new label dimensions.
func (r *Registry) Handler() http.Handler {
	return promhttp.HandlerFor(r.registry, promhttp.HandlerOpts{})
}

// SessionCreated records one admitted Session and acquires one active-gauge
// unit that SessionClosed must release exactly once.
func (r *Registry) SessionCreated() { r.sessionsCreated.Inc(); r.sessionsActive.Inc() }

// SessionClosed releases active ownership and records a terminal result. Both
// labels are normalized to fixed enums before collector lookup.
func (r *Registry) SessionClosed(outcome, reason string) {
	r.sessionsActive.Dec()
	r.sessionsClosed.WithLabelValues(
		normalize(outcome, sessionOutcomes, "failed"),
		normalize(reason, closeReasons, "unknown"),
	).Inc()
}

// SignalingRequest increments one finite endpoint/status-class pair and
// observes its wall duration in seconds.
func (r *Registry) SignalingRequest(endpoint, statusClass string, duration time.Duration) {
	endpoint = normalize(endpoint, endpoints, "statuses")
	r.signalingCount.WithLabelValues(endpoint, normalize(statusClass, statusClasses, "5xx")).Inc()
	r.signalingLatency.WithLabelValues(endpoint).Observe(duration.Seconds())
}

// ICETransition records one transition after normalizing both values to Pion's
// finite public state vocabulary.
func (r *Registry) ICETransition(from, to string) {
	r.iceTransitions.WithLabelValues(normalize(from, iceStates, "Unknown"), normalize(to, iceStates, "Unknown")).Inc()
}

// Deadline increments the lifecycle stage whose finite timer expired.
func (r *Registry) Deadline(stage string) {
	r.deadlines.WithLabelValues(normalize(stage, deadlineStages, "close")).Inc()
}

// AudioFrame records one input/output frame outcome without accepting audio
// bytes, session identity, or other payload-derived labels.
func (r *Registry) AudioFrame(direction, outcome string) {
	r.audioFrames.WithLabelValues(normalize(direction, directions, "in"), normalize(outcome, audioOutcomes, "dropped")).Inc()
}

// RTPDrop records one bounded ordering decision.
func (r *Registry) RTPDrop(reason string) {
	r.rtpDrops.WithLabelValues(normalize(reason, rtpReasons, "reorder_flush")).Inc()
}

// RTCPFeedback records one packet classification without SSRC cardinality.
func (r *Registry) RTCPFeedback(kind string) {
	r.rtcpFeedback.WithLabelValues(normalize(kind, rtcpTypes, "other")).Inc()
}

// RTCPQuality observes a Receiver Report loss ratio and derived RTT seconds.
// A negative RTT means the report lacked enough timing information.
func (r *Registry) RTCPQuality(loss, rtt float64) {
	r.rtcpLoss.Observe(loss)
	if rtt >= 0 {
		r.rtcpRTT.Observe(rtt)
	}
}

// PacingLag observes one output scheduler delay in seconds.
func (r *Registry) PacingLag(seconds float64) { r.pacingLag.Observe(seconds) }

// PacingAbort records why pending output was discarded.
func (r *Registry) PacingAbort(reason string) {
	r.pacingAborts.WithLabelValues(normalize(reason, pacingReasons, "codec")).Inc()
}

// CodecError records one failure at a fixed input decode, synthesis decode, or
// output encode boundary.
func (r *Registry) CodecError(direction string) {
	r.codecErrors.WithLabelValues(normalize(direction, codecDirections, "encode_out")).Inc()
}

// PipelineReconnect records start/success/failure for one of four fixed
// downstream services.
func (r *Registry) PipelineReconnect(service, result string) {
	r.reconnects.WithLabelValues(normalize(service, services, "extractor"), normalize(result, reconnectResults, "failure")).Inc()
}

// QueueDepthDelta transfers ownership of delta items to or from a fixed queue.
// Producers balance accepted enqueue, dequeue, purge, and close.
func (r *Registry) QueueDepthDelta(queue string, delta float64) {
	r.queueDepth.WithLabelValues(normalize(queue, queues, "input")).Add(delta)
}

// QueueOverflow records the fixed drop/reject policy chosen at capacity.
func (r *Registry) QueueOverflow(queue, action string) {
	r.queueOverflows.WithLabelValues(normalize(queue, queues, "input"), normalize(action, overflowActions, "reject_close")).Inc()
}

// DataChannelError records a text or telop send failure without payload data.
func (r *Registry) DataChannelError(channel string) {
	r.dataChannelError.WithLabelValues(normalize(channel, channels, "text")).Inc()
}

// CloseDuration observes resource-join duration and completion before deadline.
func (r *Registry) CloseDuration(outcome string, duration time.Duration) {
	r.closeDuration.WithLabelValues(normalize(outcome, closeOutcomes, "timeout")).Observe(duration.Seconds())
}

// ObserveInputEvent adapts media ordering/drop events into the fixed RTP/audio
// schema without receiving packet or PCM payloads.
func (r *Registry) ObserveInputEvent(event media.InputEvent) {
	switch event {
	case media.InputEventDuplicate:
		r.RTPDrop("duplicate")
		r.AudioFrame("in", "dropped")
	case media.InputEventLate:
		r.RTPDrop("late")
		r.AudioFrame("in", "dropped")
	case media.InputEventMissing:
		r.RTPDrop("missing")
		r.AudioFrame("in", "dropped")
	case media.InputEventBufferedDrop:
		r.RTPDrop("reorder_flush")
		r.AudioFrame("in", "dropped")
	case media.InputEventDTX, media.InputEventPipelineUnavailable:
		r.AudioFrame("in", "dropped")
	default:
		r.AudioFrame("in", "dropped")
	}
}

func normalize(value string, allowed map[string]struct{}, fallback string) string {
	if _, ok := allowed[value]; ok {
		return value
	}
	return fallback
}

func set(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

var (
	closeReasons     = set("normal", "process_shutdown", "offer_failed", "pre_connect_timeout", "media_readiness_timeout", "duplicate_media", "pipeline_start_error", "codec_error", "media_read_error", "media_write_error", "invalid_data_channel", "data_channel_error", "output_backpressure", "ice_failed", "ice_disconnected_timeout", "restart_timeout", "panic", "unknown")
	sessionOutcomes  = set("closed", "failed")
	endpoints        = set("config", "offer", "candidate", "statuses")
	statusClasses    = set("2xx", "4xx", "5xx")
	iceStates        = set("New", "Checking", "Connected", "Completed", "Failed", "Disconnected", "Closed", "Unknown")
	deadlineStages   = set("gather", "pre_connect", "media_readiness", "restart", "close")
	directions       = set("in", "out")
	audioOutcomes    = set("accepted", "sent", "dropped")
	rtpReasons       = set("duplicate", "late", "missing", "reorder_flush")
	rtcpTypes        = set("sr", "rr", "nack", "other")
	pacingReasons    = set("lag", "generation", "codec")
	codecDirections  = set("decode_in", "decode_synth", "encode_out")
	services         = set("extractor", "recognizer", "processor", "synthesizer")
	reconnectResults = set("start", "success", "failure")
	queues           = set("input", "speech", "text", "telop")
	overflowActions  = set("drop_oldest", "reject_close")
	channels         = set("text", "telop")
	closeOutcomes    = set("success", "timeout")
)
