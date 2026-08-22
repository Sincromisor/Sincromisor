package protocol

import "math"

// requiredValue は presence と nullable を分離する validation の共通入口である。
// Python model の default で欠損 key を補完せず、caller が渡す固定 path を error に保持する。
func requiredValue(root map[string]any, model, path string) (any, error) {
	value, ok := root[lastPathSegment(path)]
	if !ok {
		return nil, fieldError(model, path, "missing required field")
	}
	return value, nil
}

func requiredString(root map[string]any, model, path string) (string, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return "", err
	}
	result, ok := value.(string)
	if !ok {
		return "", fieldError(model, path, "expected string")
	}
	return result, nil
}

func requiredBool(root map[string]any, model, path string) (bool, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return false, err
	}
	result, ok := value.(bool)
	if !ok {
		return false, fieldError(model, path, "expected bool")
	}
	return result, nil
}

func requiredInt64(root map[string]any, model, path string) (int64, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return 0, err
	}
	result, ok := asInt64(value)
	if !ok {
		return 0, fieldError(model, path, "expected integer in int64 range")
	}
	return result, nil
}

func requiredFloat(root map[string]any, model, path string) (float64, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return 0, err
	}
	result, ok := asFloat(value)
	if !ok {
		return 0, fieldError(model, path, "expected float")
	}
	return result, nil
}

func requiredBinary(root map[string]any, model, path string) ([]byte, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return nil, err
	}
	result, ok := value.([]byte)
	if !ok || result == nil {
		return nil, fieldError(model, path, "expected binary")
	}
	owned := make([]byte, len(result))
	copy(owned, result)
	return owned, nil
}

func requiredMap(root map[string]any, model, path string) (map[string]any, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return nil, err
	}
	result, ok := value.(map[string]any)
	if !ok || result == nil {
		return nil, fieldError(model, path, "expected map")
	}
	return result, nil
}

func requiredList(root map[string]any, model, path string) ([]any, error) {
	value, err := requiredValue(root, model, path)
	if err != nil {
		return nil, err
	}
	result, ok := value.([]any)
	if !ok || result == nil {
		return nil, fieldError(model, path, "expected list")
	}
	return result, nil
}

func requiredOptionalString(root map[string]any, model, path string) (*string, error) {
	value, err := requiredValue(root, model, path)
	if err != nil || value == nil {
		return nil, err
	}
	result, ok := value.(string)
	if !ok {
		return nil, fieldError(model, path, "expected string or nil")
	}
	return &result, nil
}

func requiredOptionalInt64(root map[string]any, model, path string) (*int64, error) {
	value, err := requiredValue(root, model, path)
	if err != nil || value == nil {
		return nil, err
	}
	result, ok := asInt64(value)
	if !ok {
		return nil, fieldError(model, path, "expected integer in int64 range or nil")
	}
	return &result, nil
}

// asInt64 は MessagePack の signed/unsigned 幅差を数値一致へ正規化する。
// Python int の負値は維持し、Go int64 で表せない uint64 だけを wire error として拒否する。
func asInt64(value any) (int64, bool) {
	switch number := value.(type) {
	case int8:
		return int64(number), true
	case int16:
		return int64(number), true
	case int32:
		return int64(number), true
	case int64:
		return number, true
	case uint8:
		return int64(number), true
	case uint16:
		return int64(number), true
	case uint32:
		return int64(number), true
	case uint64:
		if number <= math.MaxInt64 {
			return int64(number), true
		}
	}
	return 0, false
}

func asFloat(value any) (float64, bool) {
	switch number := value.(type) {
	case float32:
		return float64(number), true
	case float64:
		return number, true
	default:
		return 0, false
	}
}

func lastPathSegment(path string) string {
	for index := len(path) - 1; index >= 0; index-- {
		if path[index] == '.' {
			return path[index+1:]
		}
	}
	return path
}
