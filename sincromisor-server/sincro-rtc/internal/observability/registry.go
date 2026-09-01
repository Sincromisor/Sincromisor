package observability

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Registry は専用Prometheus registryを所有する。
// 試験や複数process instance間でcollectorを漏らさないため、大域default registryには登録しない。
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

// NewRegistry はGate 3のmetric familyだけを持つ独立registryを構築する。
// I/Oを行わず、Prometheusの大域registryを変更しない。
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

// Handler はこのRegistryが所有するcollectorだけをPrometheus text形式で公開する。
// scrapeは読み取り専用で、新しいlabel次元を追加できない。
func (r *Registry) Handler() http.Handler {
	return promhttp.HandlerFor(r.registry, promhttp.HandlerOpts{})
}
