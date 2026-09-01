package input

import (
	"github.com/pion/interceptor"
	"github.com/pion/rtp"
)

// RTPReader はPion remote trackから順次RTP packetを読む境界である。
//
// readerはnetwork到着順だけを提供し、Processorが並べ替え、復号、再標本化を担当する。
// NACKとPLCはreaderの責務外である。
type RTPReader interface {
	ReadRTP() (*rtp.Packet, interceptor.Attributes, error)
}
