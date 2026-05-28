package main

import (
	"fmt"
	"log"
	"net/http"

	"vaultimator/backend/api"
	"vaultimator/backend/config"
	"vaultimator/backend/logger"
)

func main() {
	logger.Init()
	logger.SafeLogInfo("Starting Vaultimator Backend...")

	cfg, err := config.LoadConfig("config.yaml")
	if err != nil {
		logger.SafeLogError("Failed to load configuration: %v", err)
		log.Fatalf("Fatal: %v", err)
	}

	app := api.NewApp(cfg)

	mux := http.NewServeMux()
	app.SetupRoutes(mux)

	// Simple CORS middleware for local development
	corsMux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		mux.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	logger.SafeLogInfo("Server listening on %s", addr)
	
	if err := http.ListenAndServe(addr, corsMux); err != nil {
		logger.SafeLogError("Server failed: %v", err)
		log.Fatalf("Fatal: %v", err)
	}
}
