import express, {Handler, Request, Response} from "express";
import expressSession, {Session, SessionData} from "express-session";
import fetch from 'node-fetch';
import {createProxyMiddleware} from 'http-proxy-middleware';
import * as fs from 'fs';
import * as https from 'https';
import * as sqlite3 from 'sqlite3'
import sqliteStoreFactory from 'express-session-sqlite'

const app = express();

const requiredEnvironmentKeys = ['HOME_ASSISTANT_URL', 'PROXY_CALLBACK_URL', 'PROXY_TO_URL'];
requiredEnvironmentKeys.forEach(key => {
    if (!process.env[key]) {
        throw new Error('You should provide ' + key);
    }
});

const homeAssistantPublicUrl = process.env['HOME_ASSISTANT_URL']!;
const homeAssistantApiUrl = process.env['HOME_ASSISTANT_API_URL'] ?? homeAssistantPublicUrl;
const proxyUrl = process.env['PROXY_CALLBACK_URL']!;
const proxyToUrl = process.env['PROXY_TO_URL']!;
const port = Number(process.env['PORT'] ?? 8000);

if (process.env['TRUST_EVERY_SSL']) {
    // @ts-ignore
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
}

const callbackUrl = '/ha_auth_proxy_callback';

declare module 'express-session' {
    interface SessionData {
        user?: { accessToken: string, refreshToken: string };
    }
}

// @ts-ignore
const SqliteStore = sqliteStoreFactory.default(expressSession)
app.use(expressSession({
    store: new SqliteStore({
        driver: sqlite3.Database,
        path: '/tmp/sqlite.db',
        ttl: 1000 * 60 * 5,
    }),
    secret: 'keyboard cat',
    resave: false,
    cookie: {
        maxAge: 1000 * 60 * 5
    },
    saveUninitialized: true
}));

const refreshToken = async (session: Session & Required<SessionData>) => {
    const refreshToken = session.user?.refreshToken;
    const response = await tokenRequest('refresh_token', refreshToken);
    if (response.ok) {
        const {access_token: accessToken} = await response.json() as { access_token: string };
        session.user = {
            accessToken, refreshToken
        }
    } else {
        throw new Error(`Token refresh failed ${response.status} ${response.statusText} "${await response.text()}"`)
    }
}

const tokenRequest = async (grantType: 'refresh_token' | 'authorization_code', code: string) => {
    return fetch(`${homeAssistantApiUrl}/auth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: `grant_type=${grantType}&${grantType === 'refresh_token' ? 'refresh_token' : 'code'}=${code}&client_id=${encodeURIComponent(proxyUrl)}`
    });
}

function doRedirect(res: Response, state: string) {
    res.redirect(`${homeAssistantPublicUrl}/auth/authorize?client_id=${encodeURIComponent(proxyUrl)}&redirect_uri=${encodeURIComponent(proxyUrl + callbackUrl)}&state=${encodeURIComponent(state)}`)
}

const isAuthenticated: Handler = async (req, res, next) => {
    if (req.session.user !== undefined && req.session.user.refreshToken !== undefined) {
        try {
            await refreshToken(req.session as Session & Required<SessionData>);
            next();
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            } else {
                console.log("Token exchange failed", e);
            }
            doRedirect(res, req.path);
        }
    } else {
        doRedirect(res, req.path);
    }
}

app.get(callbackUrl, async (req: Request<any, any, any, { code: string, state: string }>, res) => {
    const {code, state} = req.query;
    try {
        const response = await tokenRequest('authorization_code', code);
        if (response.ok) {
            const data = await response.json() as { access_token: string, refresh_token: string };
            const accessToken = data.access_token as string;
            const refreshToken = data.refresh_token as string;
            req.session.regenerate(() => {
                req.session.user = {
                    accessToken, refreshToken
                }
                req.session.save(() => {
                    res.redirect(state);
                });
            })
        } else {
            res.send(`Token exchange with home assistant failed ${response.status} ${response.statusText} "${await response.text()}"`);
        }

    } catch (e) {
        console.log(e);
    }
})

app.get("/ha_auth_proxy_is_authenticated", isAuthenticated, (req, res) => {
    res.send("You are authenticated!");
});

app.use(isAuthenticated, createProxyMiddleware({
    target: proxyToUrl,
    ws: true
}));

if (process.env['USE_SSL']) {
    const privateKey = fs.readFileSync('/etc/ssl/private.key');
    const certificate = fs.readFileSync('/etc/ssl/certificate.crt');
    https.createServer({
        key: privateKey,
        cert: certificate
    }, app).listen(port);
} else {
    app.listen(port, () => console.log(`Started on ${port}`));
}


