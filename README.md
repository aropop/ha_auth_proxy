# Home Assistant Auth Proxy

Add authentication through home assistant to any service running in docker

## Getting started

Example docker-compose.yml, here filestash is an unauthenticated docker service which home assistant authentication will
be added to

```yaml
version: '3'
services:
  homeassistant:
    container_name: home-assistant
    image: homeassistant/home-assistant:latest
    restart: always
    network_mode: host
  filestash:
    container_name: filestash
    image: machines/filestash
    restart: always
  filestashauthproxy:
    container_name: filestash_auth_proxy
    image: ghcr.io/aropop/ha_auth_proxy:latest
    ports:
      - 8334:8000
    volumes:
      - ./ssl:/etc/ssl
    environment:
      - HOME_ASSISTANT_URL=https://my-home-asssistant.com
      - PROXY_CALLBACK_URL=https://proxy-url.com:12345
      - PROXY_TO_URL=http://filestash:8334
      - SESSION_SECRET=aRandomStringToBeSecure
      - USE_SSL=true
```

If multiple services need authentication to be added, multiple authentication proxies can be used

## Options

Options can be used through environment variables

| Env variable             | Required | Description                                                                                                                |
|--------------------------|----------|----------------------------------------------------------------------------------------------------------------------------|
| `HOME_ASSISTANT_URL`     | true     | Url of the home assistant instance                                                                                         |
| `PROXY_CALLBACK_URL`     | true     | Url of the proxy instance, will be used in oauth callback                                                                  |
| `PROXY_TO_URL`           | true     | Url of the home assistant instance                                                                                         |
| `SESSION_SECRET`         | true     | A string used to secure the session, see [express-session](http://expressjs.com/en/resources/middleware/session.html)      |
| `USE_SSL`                | false    | Use SSL (HTTPS) for the proxy if enabled a volume with `private.key` and `certificate.crt` should be mounted to `/etc/ssl` |
| `HOME_ASSISTANT_API_URL` | false    | Url used to do OAuth API calls to home assistant defaults to HOME_ASSISTANT_URL                                            |
| `PORT`                   | false    | Port on which the proxy starts, defaults to 8000                                                                           |
| `TRUST_EVERY_SSL`        | false    | Ignore node.js SSL errors, defaults to false                                                                               |

## Build from source

```
npm install && npm run build && docker build .
```

## How it works

The proxy will check if you are logged in to home assistant, if no existing sessions exists
the proxy will redirect you to the home assistant OAuth login screen. When logged in a session
will be created between the browser and the proxy, which will be checked on each request. All HTTP
and WS traffic will be proxied to the configured service.

<img src="https://github.com/aropop/ha_auth_proxy/blob/main/flow.png?raw=true">

## Debug

Authenticated status can be checked by opening `http(s)://your-proxy-url/ha_auth_proxy_is_authenticated` in a browser

## References

Home assistant OAuth documentation: https://developers.home-assistant.io/docs/auth_api/
