package main

import (
	"bufio"
	"errors"
	"io"
	"os"
	"strings"
)

// stdin is where `--code -` and `--pair -` read the code (replaced in tests).
var stdin io.Reader = os.Stdin

// codeArg is the pairing code a flag names: the value itself, or for "-" the first line on stdin, trimmed (spec change
// 46, item 6, T29: the code isn't on the command line while the command runs). Its format is checked where it's used.
func codeArg(v string) (string, error) {
	if v != "-" {
		return v, nil
	}
	line, err := bufio.NewReader(io.LimitReader(stdin, 256)).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	code := strings.TrimSpace(line)
	if code == "" {
		return "", errors.New("no pairing code on stdin: pipe the code in, for example printf '%s\\n' <code> | xmr-bridge pair --config <file> --code -")
	}
	return code, nil
}
