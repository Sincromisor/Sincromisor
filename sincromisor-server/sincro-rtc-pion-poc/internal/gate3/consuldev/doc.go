// Package consuldev は Gate 3 用の隔離された loopback Consul development agent を所有する。
//
// Start は8500番 port の既存 process を変更しない。自身の child 起動後に leader を待ち、
// 過不足ない4 proxy endpoint を登録し、失敗時は部分所有を rollback する。
package consuldev
