package report

import (
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
)

var (
	commitPattern   = regexp.MustCompile(`^[0-9a-f]{40}$`)
	digestPattern   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	scenarioPattern = regexp.MustCompile(`^[A-Z0-9]+(?:-[A-Z0-9]+)+$`)
)

// Validate は必須 field、version、enum 組合せ、時刻、ID 重複を公開前に検査する。
//
// 未知 enum や矛盾する cleanup は拒否し、部分的に有効な document を許容しない。
func Validate(document Document) error {
	if document.SchemaVersion != 1 {
		return errors.New("schema_version must be 1")
	}
	if !commitPattern.MatchString(document.Commit) {
		return errors.New("commit must be 40 lowercase hexadecimal characters")
	}
	if len(document.Inputs) == 0 {
		return errors.New("inputs must not be empty")
	}
	for index, input := range document.Inputs {
		if input.Name == "" || input.Version == "" || !filepath.IsAbs(input.Path) {
			return fmt.Errorf("input %d is missing name, absolute path, or version", index)
		}
		if input.SHA256 != nil && !digestPattern.MatchString(*input.SHA256) {
			return fmt.Errorf("input %d sha256 is invalid", index)
		}
	}
	if len(document.Scenarios) == 0 {
		return errors.New("scenarios must not be empty")
	}
	ids := make(map[string]struct{}, len(document.Scenarios))
	for index, scenario := range document.Scenarios {
		if err := validateScenario(scenario); err != nil {
			return fmt.Errorf("scenario %d: %w", index, err)
		}
		if _, duplicate := ids[scenario.ID]; duplicate {
			return fmt.Errorf("scenario ID %q is duplicated", scenario.ID)
		}
		ids[scenario.ID] = struct{}{}
	}
	return nil
}

func validateScenario(scenario Scenario) error {
	if !scenarioPattern.MatchString(scenario.ID) {
		return errors.New("ID must match the finite uppercase hyphenated schema")
	}
	if scenario.StartedAt.IsZero() || scenario.EndedAt.IsZero() {
		return errors.New("started_at and ended_at are required")
	}
	_, startOffset := scenario.StartedAt.Zone()
	_, endOffset := scenario.EndedAt.Zone()
	if startOffset != 0 || endOffset != 0 {
		return errors.New("timestamps must use UTC")
	}
	if scenario.StartedAt.After(scenario.EndedAt) {
		return errors.New("started_at must not be after ended_at")
	}
	switch scenario.Status {
	case StatusPass:
		if scenario.FailureClass != FailureNone {
			return errors.New("PASS requires failure_class NONE")
		}
	case StatusFail, StatusNotObserved:
		if !isFailure(scenario.FailureClass) {
			return errors.New("FAIL and NOT_OBSERVED require a failure class")
		}
	default:
		return errors.New("status is unknown")
	}
	if scenario.Observations == nil {
		return errors.New("observations is required")
	}
	if err := validateObservationIntegers("", reflect.ValueOf(scenario.Observations)); err != nil {
		return err
	}
	switch scenario.Cleanup.Status {
	case CleanupPass:
		if scenario.Cleanup.Error != nil {
			return errors.New("cleanup PASS requires null error")
		}
	case CleanupFail:
		if scenario.Cleanup.Error == nil || strings.TrimSpace(*scenario.Cleanup.Error) == "" {
			return errors.New("cleanup FAIL requires a non-empty error")
		}
	default:
		return errors.New("cleanup status is unknown")
	}
	return nil
}

func isFailure(class FailureClass) bool {
	return class == FailureHarness || class == FailureProduct || class == FailureEnvironment
}

// observations は拡張可能な object だが、単位契約を持つ duration/count field の
// 浮動小数化だけは再帰的に拒否し、後続集計で丸め差が生じないようにする。
func validateObservationIntegers(path string, value reflect.Value) error {
	if !value.IsValid() {
		return nil
	}
	if value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		return validateObservationIntegers(path, value.Elem())
	}
	base := strings.ToLower(filepath.Base(strings.ReplaceAll(path, ".", string(filepath.Separator))))
	integerField := strings.Contains(base, "duration") || strings.Contains(base, "count")
	switch value.Kind() {
	case reflect.Map:
		iter := value.MapRange()
		for iter.Next() {
			key := fmt.Sprint(iter.Key().Interface())
			childPath := key
			if path != "" {
				childPath = path + "." + key
			}
			if err := validateObservationIntegers(childPath, iter.Value()); err != nil {
				return err
			}
		}
	case reflect.Slice, reflect.Array:
		for index := 0; index < value.Len(); index++ {
			if err := validateObservationIntegers(path, value.Index(index)); err != nil {
				return err
			}
		}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return nil
	default:
		if integerField {
			return fmt.Errorf("observation %s must be an integer", path)
		}
	}
	return nil
}
