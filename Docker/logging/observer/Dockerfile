FROM golang:1.26.8-bookworm AS build
WORKDIR /src
COPY main.go consul.go ./
RUN CGO_ENABLED=0 go build -o /log-observer main.go consul.go
FROM busybox:1.37.0-uclibc
COPY --from=build /log-observer /log-observer
ENTRYPOINT ["/log-observer"]
