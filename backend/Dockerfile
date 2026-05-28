# Build stage
FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o vaultimator_backend .

# Run stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Create directories for data and logs so they exist and have correct permissions
RUN mkdir -p /app/data /app/logs

COPY --from=builder /app/vaultimator_backend /app/

EXPOSE 8080

CMD ["/app/vaultimator_backend"]
