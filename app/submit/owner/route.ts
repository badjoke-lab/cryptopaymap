// app/submit/owner/route.ts
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { sendMail } from "@/lib/mail";

import {
  sanitizeText,
  sanitizeHeaderValue,
  sanitizeUrl,
  validatePlaceId,
  resolvePlaceIdNamespace,
} from "@/lib/sanitize";

const MEDIA_DIR =
  process.env.NODE_ENV === "production" ? "/tmp/media" : "public/media"; // Vercel配慮
const OUT_DIR =
  process.env.NODE_ENV === "production"
    ? "/tmp/submissions/owner"
    : "public/data/submissions/owner";
const MAIL_MODE = (process.env.MAIL_TRANSPORT ?? "console").toLowerCase();
const MAIL_TO = process.env.MAIL_TO || ""; // 運営宛
const MAIL_OUT_DIR = process.env.MAIL_OUT_DIR ?? "public/_mail";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function sha1hex(buf: Buffer) {
  return createHash("sha1").update(buf).digest("hex").slice(0, 16);
}
function nowISO() {
  return new Date().toISOString();
}
async function ensureDirs() {
  await Promise.all(
    [MEDIA_DIR, OUT_DIR, MAIL_OUT_DIR].map((d) =>
      fsp.mkdir(d, { recursive: true }).catch(() => {})
    )
  );
}

async function saveFileToMedia(file: File) {
  const buf = Buffer.from(await file.arrayBuffer());
  const max = ((Number(process.env.IMG_MAX_MB) || 2) * 1024 * 1024) | 0;
  if (buf.length > max) throw new Error(`file too large: ${file.name}`);

  const ext =
    (file.type === "image/png" && "png") ||
    (file.type === "image/webp" && "webp") ||
    "jpg";

  const hash = sha1hex(buf);
  const filename = `${hash}.${ext}`;
  const full = path.join(MEDIA_DIR, filename);
  if (!fs.existsSync(full)) await fsp.writeFile(full, buf);
  return {
    url: `/media/${filename}`,
    fileId: hash,
    bytes: buf.length,
    type: file.type,
  };
}

function buildOwnerMailText(args: {
  ref: string;
  name: string;
  submitterName: string;
  submitterEmail: string;
  address: string;
  city: string;
  country: string;
  website: string | null;
  id: string;
  external_ids: Record<string, string>;
  images: number;
  proposed?: { lat: number; lng: number } | null;
}) {
  const lines = [
    `New Owner submission`,
    `Ref: ${args.ref}`,
    `When: ${nowISO()}`,
    `Submitter: ${args.submitterName} <${args.submitterEmail}>`,
    `Business: ${args.name}`,
    `Address/City/Country: ${args.address} / ${args.city} / ${args.country}`,
    `Website: ${args.website ?? ""}`,
    `ID: ${args.id}`,
    `External IDs: ${
      Object.keys(args.external_ids).length
        ? JSON.stringify(args.external_ids)
        : "-"
    }`,
    `Images: ${args.images}`,
    args.proposed
      ? `Proposed coords: ${args.proposed.lat}, ${args.proposed.lng}`
      : `Proposed coords: -`,
  ];
  if (MAIL_MODE === "file") {
    lines.push(
      "",
      `(This is a test message saved to file because MAIL_TRANSPORT=${MAIL_MODE})`
    );
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    await ensureDirs();

    const form = await req.formData();

    // ---- scalar fields（for..eachで収集）----
    const fields: Record<string, any> = {};
    form.forEach((v, k) => {
      if (v instanceof File) return; // ファイルは下で処理
      const existing = fields[k];
      const val = sanitizeText(String(v), { maxLen: 500 });
      if (existing === undefined) fields[k] = val;
      else if (Array.isArray(existing)) existing.push(val);
      else fields[k] = [existing, val];
    });

    // ---- images（配列化してから走査）----
    const images: any[] = [];
    const imageEntries = Array.from(form.entries()).filter(
      ([, v]) => v instanceof File
    ) as [string, File][];
    for (const [k, file] of imageEntries) {
      const key = k.toLowerCase();
      if (/(image|images|photo|gallery|upload)/.test(key) && file.size > 0) {
        images.push(await saveFileToMedia(file));
      }
    }

    // core fields
    const placeIdRaw = pickField(fields, [
      "placeId",
      "Place ID",
      "place_id",
      "pid",
    ]);
    const placeName = pickField(
      fields,
      ["placeName", "Place name", "place_name"],
      120
    );
    const businessName = pickField(
      fields,
      ["Business name", "BusinessName", "Name"],
      120
    );

    const countryCodeRaw = pickField(
      fields,
      ["CountryCode", "country_code", "countryCode"],
      4
    );
    let country = "";
    if (/^[A-Za-z]{2}$/.test(countryCodeRaw)) country = countryCodeRaw.toUpperCase();
    else country = pickField(fields, ["Country", "country"], 60);

    const city = pickField(fields, ["City", "city"], 60);
    const address = pickField(
      fields,
      ["Address", "address", "Street address", "Street"],
      200
    );
    const websiteRaw = pickField(
      fields,
      ["OfficialWebsite", "Official website", "Website", "website"],
      200
    );
    const website = websiteRaw ? sanitizeUrl(websiteRaw) : null;

    const latRaw = pickField(fields, ["lat", "Lat", "Latitude"], 32);
    const lngRaw = pickField(fields, ["lng", "Lng", "Longitude"], 32);
    const lat = toNumberOrNull(latRaw, -90, 90);
    const lng = toNumberOrNull(lngRaw, -180, 180);

    const submitterName = sanitizeHeaderValue(
      fields["Submitter name"] ?? fields["SubmitterName"] ?? ""
    );
    const submitterEmail = sanitizeHeaderValue(
      fields["Submitter email"] ?? fields["SubmitterEmail"] ?? ""
    );

    if (placeIdRaw && !validatePlaceId(placeIdRaw)) {
      return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
    }

    // decide id / external_ids
    const ns = placeIdRaw ? resolvePlaceIdNamespace(placeIdRaw) : "unknown";
    let id = "";
    const external_ids: Record<string, string> = {};
    if (ns === "cpm") {
      id = placeIdRaw!.toLowerCase();
    } else {
      if (ns === "osm") external_ids.osm = placeIdRaw!;
      if (ns === "gmaps") external_ids.gmaps = placeIdRaw!;
      id = genCpmId(country, city, businessName || placeName, 1);
      // TODO: collision handling if needed
    }

    const ref = `own_${randomBytes(3).toString("base64url")}`;

    const rec: any = {
      meta: { source: "self-form", kind: "owner", timestamp: nowISO(), ref },
      id,
      name: businessName || placeName || "",
      external_ids,
      website: website ?? null,
      location: { country, city, address },
      verification: { status: "owner" as const },
      submitted_by: submitterName || null,
      submitted_email: submitterEmail || null,
      fields,
      submission: { images },
    };

    if (lat != null && lng != null) {
      rec.proposed = { lat, lng, source: "form" as const };
    }

    // 保存（Vercel本番では /tmp; 必要なら後で Blob に差し替え可）
    const outPath = path.join(OUT_DIR, `${ref}.${Date.now()}.json`);
    await fsp.writeFile(outPath, JSON.stringify(rec, null, 2) + "\n", "utf8");

    // ---- 申請時メール：運営宛 + 申請者宛 ----
    const baseMail = buildOwnerMailText({
      ref,
      name: rec.name,
      submitterName,
      submitterEmail,
      address,
      city,
      country,
      website,
      id,
      external_ids,
      images: images.length,
      proposed: rec.proposed || null,
    });

    // 運営宛
    if (MAIL_TO) {
      await sendMail({
        to: MAIL_TO,
        subject: `Owner submission — ${rec.name} (${city}, ${country})`,
        text: baseMail,
      });
    }

    // 申請者宛（控え）
    if (submitterEmail) {
      const url = new URL("/forms/submitted.html", BASE_URL);
      url.searchParams.set("kind", "owner");
      url.searchParams.set("ref", ref);
      url.searchParams.set("name", rec.name || "unknown");

      await sendMail({
        to: submitterEmail,
        subject: `We received your submission — ${rec.name}`,
        text: `Thank you for your submission to CryptoPayMap.

Business: ${rec.name}
City/Country: ${city} / ${country}
Reference: ${ref}

We’ll review your submission and notify you once it's approved and published.

You can keep this page for your record:
${url.toString()}

— CryptoPayMap`,
      });
    }

    const url = new URL("/forms/submitted.html", BASE_URL);
    url.searchParams.set("kind", "owner");
    url.searchParams.set("ref", ref);
    url.searchParams.set("name", rec.name || "unknown");
    return NextResponse.redirect(url.toString(), { status: 303 });
  } catch (err) {
    console.error("[owner] submit failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// helpers
function pickField(obj: Record<string, any>, keys: string[], maxLen?: number) {
  for (const k of keys) {
    if (obj[k] != null) return sanitizeText(String(obj[k]), { maxLen });
  }
  return "";
}
const slug = (s: string) =>
  sanitizeText(s, { maxLen: 60 })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
function genCpmId(country: string, city: string, name: string, seqHint = 1): string {
  const c = slug(country || "unknown");
  const ci = slug(city || "unknown");
  const nm = slug(name || "unknown");
  return `cpm:${c}-${ci}-${nm}-${Math.max(1, seqHint)}`;
}
function toNumberOrNull(s: string, min: number, max: number): number | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return Math.round(n * 1e7) / 1e7;
}
