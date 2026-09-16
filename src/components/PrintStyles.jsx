import React from "react";

export default function PrintStyles() {
  return (
    <style>
      {`
        @page {
          margin: 12mm;
        }

        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body * {
            visibility: hidden !important;
          }

          .printable-area {
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            max-height: none !important;
            visibility: visible !important;
          }

          .printable-area * {
            visibility: visible !important;
          }

          .monthly-letter-card {
            padding: 4mm 8mm 8mm !important;
          }

          .monthly-table-card {
            padding: 6mm !important;
            overflow: visible !important;
          }

          .printable-area .overflow-auto,
          .printable-area .overflow-x-auto,
          .printable-area [class*="overflow-auto"],
          .printable-area [class*="overflow-x-auto"] {
            overflow: visible !important;
            max-height: none !important;
            width: 100% !important;
          }

          .printable-area table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          .printable-area th,
          .printable-area td {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            font-size: 8.5px !important;
            line-height: 1.25 !important;
            padding: 3px !important;
          }

          .no-print,
          button,
          textarea,
          nav,
          aside {
            display: none !important;
          }

          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
        }
      `}
    </style>
  );
}
