//go:build gate3

package wsproxy

import (
	"errors"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestArmRejectsEmptyInvalidAndConflictingRulesWithoutMutation(t *testing.T) {
	set := ruleTestSet()
	if err := set.Arm(nil); !errors.Is(err, ErrArmConflict) {
		t.Fatalf("Arm(nil) error = %v, want ErrArmConflict", err)
	}
	invalid := validRule()
	invalid.MatchOrdinal = 2
	if err := set.Arm([]Rule{invalid}); !errors.Is(err, ErrProtocol) {
		t.Fatalf("Arm(invalid) error = %v, want ErrProtocol", err)
	}
	if err := set.Arm([]Rule{validRule()}); err != nil {
		t.Fatalf("Arm(valid) error = %v", err)
	}
	replacement := validRule()
	replacement.Action = ActionMalformed
	if err := set.Arm([]Rule{replacement}); !errors.Is(err, ErrArmConflict) {
		t.Fatalf("Arm(replacement) error = %v, want ErrArmConflict", err)
	}
	if len(set.rules) != 1 || set.rules[0].Action != ActionClose {
		t.Fatalf("conflicting Arm changed rules: %+v", set.rules)
	}
}

func TestArmRequiresCompletedNormalExchangeForEveryService(t *testing.T) {
	set := ruleTestSet()
	set.state[discovery.ServiceSynthesizer].completed = 0
	if err := set.Arm([]Rule{validRule()}); !errors.Is(err, ErrArmConflict) {
		t.Fatalf("Arm(before normal turn) error = %v, want ErrArmConflict", err)
	}
	if len(set.rules) != 0 {
		t.Fatal("failed precondition changed finite rules")
	}
}

func TestArmRejectsInFlightExchangeAndVerifyFindsFiniteState(t *testing.T) {
	set := ruleTestSet()
	set.state[discovery.ServiceProcessor].requestsInFlight = 1
	if err := set.Arm([]Rule{validRule()}); !errors.Is(err, ErrArmConflict) {
		t.Fatalf("Arm(in-flight) error = %v, want ErrArmConflict", err)
	}
	if err := set.VerifyConsumed(); !errors.Is(err, ErrRuleUnconsumed) {
		t.Fatalf("VerifyConsumed() error = %v, want ErrRuleUnconsumed", err)
	}
}

func TestRuleConsumesOnlyAtMatchingServiceHead(t *testing.T) {
	set := ruleTestSet()
	if err := set.Arm([]Rule{validRule()}); err != nil {
		t.Fatal(err)
	}
	if action := set.beginExchange(discovery.ServiceRecognizer); action != "" {
		t.Fatalf("unrelated action = %q", action)
	}
	set.finishExchange(discovery.ServiceRecognizer)
	if len(set.rules) != 1 {
		t.Fatal("unrelated service consumed rule")
	}
	if action := set.beginExchange(discovery.ServiceExtractor); action != ActionClose {
		t.Fatalf("matching action = %q, want close", action)
	}
	set.finishFault(discovery.ServiceExtractor)
	if !set.rejectUpgrade(discovery.ServiceExtractor) {
		t.Fatal("fault did not reject exactly the next upgrade")
	}
	if set.rejectUpgrade(discovery.ServiceExtractor) {
		t.Fatal("fault rejected more than one upgrade")
	}
	if err := set.VerifyConsumed(); err != nil {
		t.Fatalf("VerifyConsumed() error = %v", err)
	}
}

func ruleTestSet() *Set {
	state := make(map[discovery.Service]*serviceState, len(services))
	for _, service := range services {
		state[service] = &serviceState{completed: 1}
	}
	return &Set{state: state}
}

func validRule() Rule {
	return Rule{
		Service: discovery.ServiceExtractor, Action: ActionClose,
		MatchOrdinal: 1, RejectReconnects: 1,
	}
}
