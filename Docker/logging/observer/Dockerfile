FROM golang:1.26.9-bookworm AS build
WORKDIR /src
COPY main.go delivery.go ./
RUN CGO_ENABLED=0 go build -o /log-observer main.go delivery.go
FROM busybox:1.37.0-uclibc
COPY --from=build /log-observer /log-observer
ENTRYPOINT ["/log-observer"]
