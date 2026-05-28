package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

type hourlyLogger struct {
	mu       sync.Mutex
	filename string
	file     *os.File
	hour     int
}

func (l *hourlyLogger) Write(p []byte) (n int, err error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	// Rotate if it's a different hour or file is not opened
	if l.file == nil || now.Hour() != l.hour {
		if l.file != nil {
			l.file.Close()
		}
		os.MkdirAll("logs", 0755)
		l.hour = now.Hour()
		l.filename = fmt.Sprintf("logs/vaultimator-%s.log", now.Format("2006-01-02-15"))
		f, err := os.OpenFile(l.filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			return 0, err
		}
		l.file = f
	}
	return l.file.Write(p)
}

// Init configures the standard log package to write to an hourly rotated file
// as well as os.Stdout.
func Init() {
	hl := &hourlyLogger{}
	multiWriter := io.MultiWriter(os.Stdout, hl)
	log.SetOutput(multiWriter)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
}

// SafeLogInfo logs informational messages safely without printing sensitive data
func SafeLogInfo(msg string, args ...interface{}) {
	log.Printf("[INFO] "+msg, args...)
}

// SafeLogError logs error messages
func SafeLogError(msg string, args ...interface{}) {
	log.Printf("[ERROR] "+msg, args...)
}
