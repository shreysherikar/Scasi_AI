import { getSession } from "@/lib/getSession";
import { NextResponse } from "next/server";

export async function GET(req) {
    try {
        const session = await getSession(req);

        if (session) {
            return NextResponse.json({ authenticated: true }, { status: 200 });
        }

        return NextResponse.json({ authenticated: false }, { status: 401 });
    } catch (_error) {
        return NextResponse.json({ error: "Session check failed" }, { status: 500 });
    }
}
