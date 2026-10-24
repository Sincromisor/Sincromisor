FROM golang:1.26.10-bookworm AS build
WORKDIR /src
COPY main.go delivery.go ./
RUN CGO_ENABLED=0 go build -o /log-observer main.go delivery.go
FROM busybox:1.38.0-uclibc
COPY --from=build /log-observer /log-observer
ENTRYPOINT ["/log-observer"]
