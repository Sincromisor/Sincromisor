FROM caddy:latest
COPY --chown=root:root ./Docker/env_vars/Caddyfile /etc/caddy/Caddyfile
#RUN SERVER_NAME="grep 'ServerName:' config.yml | sed 's/ServerName: //'" && \
#    sed -i -e "s/SERVER_NAME/${SERVER_NAME}/" /etc/caddy/Caddyfile

#CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--resume"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
