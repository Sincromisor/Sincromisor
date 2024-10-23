FROM caddy:latest
COPY --chown=root:root ./Docker/env_vars/Caddyfile /etc/caddy/Caddyfile

#CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--resume"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
