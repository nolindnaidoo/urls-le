// Package client talks to the API at https://api.example.com/v1
package client

import "net/http"

const (
	base   = "https://api.example.com/v1"
	health = "http://health.example.com/ready"
)

// Raw string literals keep their URL: `https://raw.example.com/spec.json`
var spec = `https://raw.example.com/spec.json`

func New() *http.Client {
	// tel:+15551234567 is on the support page
	return http.DefaultClient
}
