import express from "express";
import { asncapc, intentc } from "./db.js";
import { getAsn } from "./utils.js";
import { expandIPv6Address, ipTo128bin, ipv4ToInt, ipv6ToBigInt } from "./ip-utils.js";
import fs from "fs";

export const app = express();
app.set('trust proxy', true);
app.use("/assets/pictures", express.static("./assets"));
const path = process.env['FRONTENDPATH'] || (__dirname + "/../../frontend/home");
const st = express.static(path, { extensions: ['html'], redirect: false });
app.use(st);

const isIpv4 = (s: string) => s?.includes('.');

export const findInList = async (list: any, ip?: string) => {
    if (!ip)
        return;
    if (isIpv4(ip)) {
        const s2 = ipv4ToInt(ip);
        const s = ipTo128bin(s2);
        return await list.findOne({ v: 4, hi: { $gte: s }, low: { $lte: s } } as any);
    }
    const s = ipTo128bin(ipv6ToBigInt(expandIPv6Address(ip)));
    return await list.findOne({ v: 6, hi: { $gte: s }, low: { $lte: s } } as any);
};

const str = fs.createWriteStream("./dump");

app.get("/api/intent", async (req, res): Promise<any> => {
    str.write("apiintent\n")
    const asn = getAsn(req);
    str.write(`got asn ${asn}\n`)
    const asncaps = await asncapc.findOne({ asn });
    if (asncaps && (asncaps.cap & 2) == 0) {
        str.write(`returning 403 ${asn}\n`)
        return res.status(403);
    }

    str.write(`insertinto db\n`)
    const doc = await intentc.insertOne({
        creationDate: new Date,
        sd: 'sd' in req.query,
        files: []
    });
    str.write(`insertinto db\n`)
    res.json({ id: doc.insertedId.toJSON() });
});

app.get("/api/debug", async (req, res): Promise<any> => {
    res.json({ head: req.headers });
});

app.use('*', (req, res) => {
    res.sendFile(path + '/index.html');
});

export const initApi = async () => {

};
