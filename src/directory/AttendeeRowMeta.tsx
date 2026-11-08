import React from "react";
import { Attendee } from "../core/types";

export interface AttendeeRowMetaProps {
  attendee: Attendee;
}

/**
 * Komponen reusable untuk menampilkan kolom identitas peserta (Nama, Email, Kode Tiket, dan Organisasi).
 */
export function AttendeeRowMeta({ attendee }: AttendeeRowMetaProps) {
  return (
    <>
      <td className="py-2.5 px-3.5">
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900 text-xs">{attendee.name}</span>
          {attendee.email && (
            <span className="text-[11px] text-slate-400">{attendee.email}</span>
          )}
        </div>
      </td>

      <td className="py-2.5 px-3.5 font-mono text-[11px]">
        <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
          {attendee.ticketCode}
        </span>
      </td>

      <td className="py-2.5 px-3.5 text-slate-500 text-xs">
        {attendee.organization || "—"}
      </td>
    </>
  );
}
