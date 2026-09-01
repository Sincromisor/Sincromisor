package pipelinecontract

import (
	"bytes"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"reflect"

	"github.com/vmihailenco/msgpack/v5"
)

var fixtureNames = []string{
	"extractor_initialize.msgpack",
	"extractor_result.msgpack",
	"recognizer_result.msgpack",
	"text_processor_request.msgpack",
	"text_processor_result.msgpack",
	"voice_synthesizer_result.msgpack",
}

func loadFixtures(dir string) (map[string][]byte, map[string]any, error) {
	fixtures := make(map[string][]byte, len(fixtureNames))
	schemas := make(map[string]any, len(fixtureNames))
	for _, name := range fixtureNames {
		payload, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, nil, fmt.Errorf("%w: read fixture %s: %v", ErrProtocol, name, err)
		}
		var decoded any
		reader := bytes.NewReader(payload)
		if err := msgpack.NewDecoder(reader).Decode(&decoded); err != nil || reader.Len() != 0 {
			return nil, nil, fmt.Errorf("%w: decode fixture %s", ErrProtocol, name)
		}
		fixtures[name], schemas[name] = payload, decoded
	}
	return fixtures, schemas, nil
}

// validateShape は key と MessagePack value family を再帰的に比較する。
// 動的な identity と履歴値は変化できるが、Python の binary/string と map/list 境界は
// commit 済み producer fixture と一致しなければならない。
func validateShape(actual, expected any) bool {
	if expected == nil {
		// Pythonの任意scalar fieldは一部のfixture messageではnil、
		// 後続history entryでは宣言されたscalar型で表現される。
		return actual == nil || isInteger(actual) || isString(actual)
	}
	switch want := expected.(type) {
	case map[string]any:
		got, ok := actual.(map[string]any)
		if !ok || len(got) != len(want) {
			return false
		}
		for key, value := range want {
			candidate, found := got[key]
			if !found || !validateShape(candidate, value) {
				return false
			}
		}
		return true
	case []any:
		got, ok := actual.([]any)
		if !ok {
			return false
		}
		if len(want) == 0 {
			return true
		}
		for index := range got {
			template := want[len(want)-1]
			if index >= len(want) {
				if !validateShape(got[index], template) {
					return false
				}
				continue
			}
			template = want[index]
			if !validateShape(got[index], template) {
				return false
			}
		}
		return true
	}
	if isInteger(actual) && isInteger(expected) {
		return true
	}
	if isFloat(actual) && isFloat(expected) {
		return true
	}
	return reflect.TypeOf(actual) == reflect.TypeOf(expected)
}

func isString(value any) bool {
	_, ok := value.(string)
	return ok
}

func isInteger(value any) bool {
	switch value.(type) {
	case int8, int16, int32, int64, uint8, uint16, uint32, uint64:
		return true
	default:
		return false
	}
}

func isFloat(value any) bool {
	switch value.(type) {
	case float32, float64:
		return true
	default:
		return false
	}
}

func validateHost(host string) error {
	address := net.ParseIP(host)
	if host == "" || address == nil || !address.IsLoopback() {
		return fmt.Errorf("ListenHost must be a loopback IP address without a port")
	}
	return nil
}

func decodeMap(payload []byte) (map[string]any, error) {
	var value map[string]any
	reader := bytes.NewReader(payload)
	if err := msgpack.NewDecoder(reader).Decode(&value); err != nil || value == nil || reader.Len() != 0 {
		return nil, fmt.Errorf("%w: invalid MessagePack object", ErrProtocol)
	}
	return value, nil
}

func int64Field(value map[string]any, key string) (int64, bool) {
	number, ok := value[key]
	if !ok {
		return 0, false
	}
	switch typed := number.(type) {
	case int8:
		return int64(typed), true
	case int16:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		return typed, true
	case uint8:
		return int64(typed), true
	case uint16:
		return int64(typed), true
	case uint32:
		return int64(typed), true
	case uint64:
		return int64(typed), typed <= uint64(^uint64(0)>>1)
	}
	return 0, false
}
