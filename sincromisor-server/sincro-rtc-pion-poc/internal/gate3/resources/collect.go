package resources

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type collector struct {
	config Config
	client *http.Client
	now    func() time.Time
}

func newCollector(config Config, client *http.Client) (*collector, error) {
	if runtime.GOOS != "linux" {
		return nil, errors.New("Gate 3 resource sampling requires Linux")
	}
	if config.PID <= 0 {
		return nil, errors.New("PID must be positive")
	}
	if !filepath.IsAbs(config.ProcRoot) {
		return nil, errors.New("proc root must be absolute")
	}
	if info, err := os.Stat(config.ProcRoot); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("proc root is unavailable: %w", err)
	}
	for name, raw := range map[string]string{"metrics URL": config.MetricsURL, "status URL": config.StatusURL} {
		parsed, err := url.ParseRequestURI(raw)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return nil, fmt.Errorf("%s must be an absolute HTTP URL", name)
		}
	}
	if client == nil {
		client = &http.Client{Timeout: 2 * time.Second}
	}
	return &collector{config: config, client: client, now: func() time.Time { return time.Now().UTC() }}, nil
}

// collect は procfs、metrics、statusの順に一回の raw 入力を domain Sampleへ変換する。
// 途中失敗では部分値を返さず、caller がその回を丸ごと診断列へ送れるようにする。
func (c *collector) collect(ctx context.Context) (Sample, error) {
	fdCount, sockets, err := collectProc(c.config.ProcRoot, c.config.PID)
	if err != nil {
		return Sample{}, err
	}
	sessions, queues, err := c.collectMetrics(ctx)
	if err != nil {
		return Sample{}, err
	}
	status, err := c.collectStatus(ctx)
	if err != nil {
		return Sample{}, err
	}
	var goroutines *int
	if c.config.PID == os.Getpid() {
		count := runtime.NumGoroutine()
		goroutines = &count
	}
	if sessions != status.Sessions {
		return Sample{}, fmt.Errorf("session count mismatch: metrics=%d status=%d", sessions, status.Sessions)
	}
	return Sample{
		At:           c.now(),
		PID:          c.config.PID,
		FDCount:      fdCount,
		SocketInodes: sockets,
		Goroutines:   goroutines,
		Sessions:     sessions,
		SessionLimit: status.SessionLimit,
		Ready:        status.Ready,
		Draining:     status.Draining,
		Queues:       queues,
	}, nil
}

func collectProc(procRoot string, pid int) (int, []uint64, error) {
	fdPath := filepath.Join(procRoot, strconv.Itoa(pid), "fd")
	entries, err := os.ReadDir(fdPath)
	if err != nil {
		return 0, nil, fmt.Errorf("read process fd directory: %w", err)
	}
	inodes := make(map[uint64]struct{})
	for _, entry := range entries {
		target, err := os.Readlink(filepath.Join(fdPath, entry.Name()))
		if err != nil {
			// fd は directory snapshot 後に対象 process が閉じ得る。その entry は FDCount には
			// 含めるが socket 所有権は既に終了しているため、ENOENTだけを非 socket として扱う。
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return 0, nil, fmt.Errorf("read fd %s symlink: %w", entry.Name(), err)
		}
		if !strings.HasPrefix(target, "socket:[") || !strings.HasSuffix(target, "]") {
			continue
		}
		inode, err := strconv.ParseUint(strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]"), 10, 64)
		if err != nil {
			return 0, nil, fmt.Errorf("parse socket inode for fd %s: %w", entry.Name(), err)
		}
		inodes[inode] = struct{}{}
	}
	sockets := make([]uint64, 0, len(inodes))
	for inode := range inodes {
		sockets = append(sockets, inode)
	}
	sort.Slice(sockets, func(i, j int) bool { return sockets[i] < sockets[j] })
	return len(entries), sockets, nil
}

func (c *collector) collectMetrics(ctx context.Context) (int, Queues, error) {
	body, err := c.get(ctx, c.config.MetricsURL)
	if err != nil {
		return 0, Queues{}, fmt.Errorf("get metrics: %w", err)
	}
	values := map[string]int64{"input": 0, "speech": 0, "text": 0, "telop": 0}
	var sessions *int64
	scanner := bufio.NewScanner(strings.NewReader(string(body)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "sincro_rtc_sessions_active ") {
			value, err := parseMetricValue(strings.TrimSpace(strings.TrimPrefix(line, "sincro_rtc_sessions_active ")))
			if err != nil {
				return 0, Queues{}, fmt.Errorf("parse active sessions: %w", err)
			}
			sessions = &value
			continue
		}
		if strings.HasPrefix(line, "sincro_rtc_queue_depth{") {
			queue, value, err := parseQueueMetric(line)
			if err != nil {
				return 0, Queues{}, err
			}
			if _, known := values[queue]; known {
				values[queue] = value
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, Queues{}, fmt.Errorf("scan metrics: %w", err)
	}
	if sessions == nil {
		return 0, Queues{}, errors.New("active session metric is missing")
	}
	return int(*sessions), Queues{
		Input: values["input"], Speech: values["speech"], Text: values["text"], Telop: values["telop"],
	}, nil
}

func parseQueueMetric(line string) (string, int64, error) {
	closing := strings.Index(line, "} ")
	if closing < 0 {
		return "", 0, errors.New("malformed queue metric")
	}
	labels := line[len("sincro_rtc_queue_depth{"):closing]
	value, err := parseMetricValue(strings.TrimSpace(line[closing+2:]))
	if err != nil {
		return "", 0, fmt.Errorf("parse queue metric: %w", err)
	}
	for _, label := range strings.Split(labels, ",") {
		key, raw, ok := strings.Cut(strings.TrimSpace(label), "=")
		if ok && key == "queue" {
			queue, err := strconv.Unquote(raw)
			if err != nil {
				return "", 0, fmt.Errorf("parse queue label: %w", err)
			}
			return queue, value, nil
		}
	}
	return "", 0, errors.New("queue metric is missing queue label")
}

func parseMetricValue(raw string) (int64, error) {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 || value != float64(int64(value)) {
		return 0, fmt.Errorf("metric must be a non-negative integer: %q", raw)
	}
	return int64(value), nil
}

type statusPayload struct {
	Sessions     int  `json:"sessions"`
	SessionLimit int  `json:"session_limit"`
	Ready        bool `json:"ready"`
	Draining     bool `json:"draining"`
}

func (c *collector) collectStatus(ctx context.Context) (statusPayload, error) {
	body, err := c.get(ctx, c.config.StatusURL)
	if err != nil {
		return statusPayload{}, fmt.Errorf("get statuses: %w", err)
	}
	var status statusPayload
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&status); err != nil {
		return statusPayload{}, fmt.Errorf("decode statuses: %w", err)
	}
	if status.Sessions < 0 || status.SessionLimit < 0 || status.Sessions > status.SessionLimit {
		return statusPayload{}, errors.New("statuses contains invalid session counts")
	}
	return status, nil
}

func (c *collector) get(ctx context.Context, endpoint string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	response, err := c.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	return body, nil
}
