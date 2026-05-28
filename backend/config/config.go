package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// AppConfig holds the configuration for the Vaultimator backend
type AppConfig struct {
	Server struct {
		Port int `yaml:"port"`
	} `yaml:"server"`
	Storage struct {
		DataFileName           string `yaml:"data_file_name"`
		MasterPasswordFileName string `yaml:"master_password_file_name"`
	} `yaml:"storage"`
	Security struct {
		SessionDurationMinutes int `yaml:"session_duration_minutes"`
	} `yaml:"security"`
}

// LoadConfig reads the configuration from a YAML file.
// If the file doesn't exist, it creates it with default settings.
func LoadConfig(filename string) (*AppConfig, error) {
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		return createDefaultConfig(filename)
	}

	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	var cfg AppConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func createDefaultConfig(filename string) (*AppConfig, error) {
	cfg := &AppConfig{}
	cfg.Server.Port = 8080
	cfg.Storage.DataFileName = "data/vault_data.enc"
	cfg.Storage.MasterPasswordFileName = "data/master.hash"
	cfg.Security.SessionDurationMinutes = 60

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return nil, err
	}

	if err := os.WriteFile(filename, data, 0600); err != nil {
		return nil, err
	}

	return cfg, nil
}
