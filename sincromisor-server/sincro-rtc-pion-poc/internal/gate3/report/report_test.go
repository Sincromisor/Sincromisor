package report

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateAcceptsAllValidEnums(t *testing.T) {
	tests := []struct {
		status Status
		class  FailureClass
	}{
		{StatusPass, FailureNone},
		{StatusFail, FailureHarness},
		{StatusFail, FailureProduct},
		{StatusNotObserved, FailureEnvironment},
	}
	for _, test := range tests {
		document := validDocument()
		document.Scenarios[0].Status = test.status
		document.Scenarios[0].FailureClass = test.class
		if err := Validate(document); err != nil {
			t.Errorf("Validate(%s/%s) error = %v", test.status, test.class, err)
		}
	}
}

func TestValidateAcceptsCleanupFailureIndependentOfScenarioPass(t *testing.T) {
	document := validDocument()
	message := "SIGKILL failed after product scenario passed"
	document.Scenarios[0].Cleanup = Cleanup{Status: CleanupFail, Error: &message}
	if err := Validate(document); err != nil {
		t.Fatalf("Validate(valid CleanupFail) error = %v", err)
	}
}

func TestValidateRejectsSchemaAndEnumInvariants(t *testing.T) {
	nonEmpty := "cleanup failed"
	tests := []struct {
		name   string
		mutate func(*Document)
	}{
		{"missing commit", func(document *Document) { document.Commit = "" }},
		{"unknown status", func(document *Document) { document.Scenarios[0].Status = "UNKNOWN" }},
		{"PASS failure", func(document *Document) { document.Scenarios[0].FailureClass = FailureProduct }},
		{"FAIL none", func(document *Document) {
			document.Scenarios[0].Status = StatusFail
			document.Scenarios[0].FailureClass = FailureNone
		}},
		{"NOT_OBSERVED none", func(document *Document) {
			document.Scenarios[0].Status = StatusNotObserved
			document.Scenarios[0].FailureClass = FailureNone
		}},
		{"cleanup PASS error", func(document *Document) { document.Scenarios[0].Cleanup.Error = &nonEmpty }},
		{"cleanup FAIL null", func(document *Document) {
			document.Scenarios[0].Cleanup.Status = CleanupFail
		}},
		{"cleanup FAIL empty", func(document *Document) {
			empty := ""
			document.Scenarios[0].Cleanup = Cleanup{Status: CleanupFail, Error: &empty}
		}},
		{"duplicate ID", func(document *Document) {
			document.Scenarios = append(document.Scenarios, document.Scenarios[0])
		}},
		{"reversed time", func(document *Document) {
			document.Scenarios[0].EndedAt = document.Scenarios[0].StartedAt.Add(-time.Second)
		}},
		{"invalid ID", func(document *Document) { document.Scenarios[0].ID = "lower-case" }},
		{"duration float", func(document *Document) {
			document.Scenarios[0].Observations["cleanup_duration_ms"] = 1.5
		}},
		{"count string", func(document *Document) {
			document.Scenarios[0].Observations["sample_count"] = "3"
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := validDocument()
			test.mutate(&document)
			if err := Validate(document); err == nil {
				t.Fatal("Validate() succeeded")
			}
		})
	}
}

func TestWriterPublishesHardLinkWithoutOverwrite(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "report.json")
	writer := NewWriter()
	if err := writer.Write(target, validDocument()); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("target mode = %o", info.Mode().Perm())
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"schema_version": 1`) {
		t.Fatalf("target body = %s", data)
	}
	if err := writer.Write(target, validDocument()); err == nil {
		t.Fatal("Writer overwrote existing target")
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("temporary files remain: %v", entries)
	}
}

func TestWriterLinkFailureRemovesTemporaryAndDoesNotCreateTarget(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "report.json")
	writer := &Writer{ops: &failingOps{fileOps: osFileOps{}, linkErr: errors.New("link failure")}}
	if err := writer.Write(target, validDocument()); err == nil {
		t.Fatal("Write() succeeded")
	}
	if _, err := os.Stat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("target after link failure: %v", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("temporary remains after link failure: %v", entries)
	}
}

func TestWriterTemporaryFileSyncFailureCleansUpWithoutTarget(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "report.json")
	syncErr := errors.New("temporary fsync failure")
	writer := &Writer{ops: &failingOps{fileOps: osFileOps{}, temporarySyncErr: syncErr}}
	err := writer.Write(target, validDocument())
	if !errors.Is(err, syncErr) {
		t.Fatalf("Write() error = %v, want temporary fsync cause", err)
	}
	if _, err := os.Stat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("target after temporary fsync failure: %v", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("temporary remains after fsync failure: %v", entries)
	}
}

func TestWriterPostLinkFailuresKeepTargetAndReturnTemporaryPath(t *testing.T) {
	tests := []struct {
		name string
		ops  func() fileOps
	}{
		{"unlink", func() fileOps {
			return &failingOps{fileOps: osFileOps{}, removeAfterLinkErr: errors.New("unlink failure")}
		}},
		{"directory fsync", func() fileOps {
			return &failingOps{fileOps: osFileOps{}, directorySyncErr: errors.New("fsync failure")}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			target := filepath.Join(t.TempDir(), "report.json")
			writer := &Writer{ops: test.ops()}
			err := writer.Write(target, validDocument())
			var publishErr *PublishError
			if !errors.As(err, &publishErr) || publishErr.TempPath == "" {
				t.Fatalf("Write() error = %v, want PublishError with temp path", err)
			}
			if _, err := os.Stat(target); err != nil {
				t.Fatalf("published target was removed: %v", err)
			}
		})
	}
}

func TestRealFilesystemHardLinkContract(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "source")
	target := filepath.Join(directory, "target")
	if err := os.WriteFile(source, []byte("contract"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(source, target); err != nil {
		t.Fatalf("hard link on report filesystem: %v", err)
	}
	sourceInfo, _ := os.Stat(source)
	targetInfo, _ := os.Stat(target)
	if !os.SameFile(sourceInfo, targetInfo) {
		t.Fatal("hard link target is not the same file")
	}
}

func validDocument() Document {
	started := time.Unix(1_800_000_000, 0).UTC()
	return Document{
		SchemaVersion: 1,
		Commit:        strings.Repeat("a", 40),
		Inputs: []Input{{
			Name: "go", Path: "/usr/bin/go", Version: "go version go1.26.5", SHA256: nil,
		}},
		Scenarios: []Scenario{{
			ID:     "G3-FOUNDATION",
			Status: StatusPass, StartedAt: started, EndedAt: started.Add(time.Second),
			FailureClass: FailureNone,
			Observations: map[string]any{"sample_count": 3, "values": []int{1, 2, 3}},
			Cleanup:      Cleanup{Status: CleanupPass, Error: nil},
		}},
	}
}

type failingOps struct {
	fileOps
	linkErr            error
	removeAfterLinkErr error
	temporarySyncErr   error
	directorySyncErr   error
	linked             bool
}

func (o *failingOps) CreateTemp(directory, pattern string) (file, error) {
	temporary, err := o.fileOps.CreateTemp(directory, pattern)
	if err != nil || o.temporarySyncErr == nil {
		return temporary, err
	}
	return &syncFailFile{file: temporary, err: o.temporarySyncErr}, nil
}

func (o *failingOps) Link(oldPath, newPath string) error {
	if o.linkErr != nil {
		return o.linkErr
	}
	if err := o.fileOps.Link(oldPath, newPath); err != nil {
		return err
	}
	o.linked = true
	return nil
}

func (o *failingOps) Remove(path string) error {
	if o.linked && o.removeAfterLinkErr != nil {
		return o.removeAfterLinkErr
	}
	return o.fileOps.Remove(path)
}

func (o *failingOps) Open(path string) (file, error) {
	opened, err := o.fileOps.Open(path)
	if err != nil || o.directorySyncErr == nil {
		return opened, err
	}
	return &syncFailFile{file: opened, err: o.directorySyncErr}, nil
}

type syncFailFile struct {
	file
	err error
}

func (f *syncFailFile) Sync() error {
	return f.err
}
