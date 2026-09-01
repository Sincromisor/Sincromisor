package observability

import "testing"

func TestNewRegistryBuildsIndependentRegistry(t *testing.T) {
	first := NewRegistry()
	second := NewRegistry()
	if first.registry == nil || second.registry == nil {
		t.Fatal("NewRegistry() returned a nil Prometheus registry")
	}
	if first.registry == second.registry {
		t.Fatal("NewRegistry() reused a process-global Prometheus registry")
	}
}
