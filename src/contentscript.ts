// @author John Cai
// @date 2026-09-09
import { CONFIG } from "./config";
import { PDFDocument } from "pdf-lib";

/**
 * Scrapes urls per sheet from the current page.
 * @returns An object containing the list of sheet image URLs and the sheet name.
 */
async function scrapeSheetInfo(): Promise<{
  list: string[];
  sheetName: string;
}> {
  const container = document.getElementById("jmuse-scroller-component");
  if (!container) {
    console.error("Container not found");
    return { list: [], sheetName: "error" };
  }

  const originalScrollTop = container.scrollTop;

  // Overlay to cover the page and indicate that the process is ongoing
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; color:white; font-size:24px; font-weight:bold; font-family:sans-serif;";
  overlay.innerText = "🎵 Extracting High-Quality Pages... Please wait.";
  document.body.appendChild(overlay);

  const imgUrls = new Set<string>();
  let lastScrollTop = -1;
  let totalPages = Infinity;
  container.scrollTop = 0; // Reset scroll position to the top
  try {
    while (container.scrollTop !== lastScrollTop) {
      lastScrollTop = container.scrollTop;

      const imgElements = document.querySelectorAll<HTMLImageElement>(
        `img.${CONFIG.SHEET_CLASS}`,
      );
      imgElements.forEach((img) => {
        if (img.src) {
          imgUrls.add(img.src);

          if (totalPages === Infinity && img.alt) {
            const match = img.alt.match(/(\d+)\s*of\s*(\d+)\s*pages?/i);
            if (match && match[2]) {
              totalPages = parseInt(match[2], 10);
              console.log(`Target acquired: ${totalPages} pages.`);
            }
          }
        }
      });

      // Break early if we have successfully found all the pages!
      if (imgUrls.size >= totalPages) {
        console.log("All pages extracted! Stopping scroll early.");
        break;
      }

      const scrollAmount = container.clientHeight * 0.8;
      container.scrollBy(0, scrollAmount);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second to allow images to load
    }
  } finally {
    document.body.removeChild(overlay);
    container.scrollTop = originalScrollTop;
  }
  const finalLinks = Array.from(imgUrls);
  const sheetName = document.querySelectorAll("h1")[0].innerText; // TOOD: hardcoded?
  return { list: finalLinks, sheetName };
}

/**
 * Generates a PDF from the provided image URLs and triggers a download with the specified sheet name.
 * @param imageUrls - An array of image URLs to include in the PDF.
 * @param nameOfSheet - The name to use for the downloaded PDF file.
 */
async function generateAndDownloadPDF(
  imageUrls: string[],
  nameOfSheet: string,
) {
  const pdfDoc = await PDFDocument.create();

  for (const url of imageUrls) {
    const imageBuffer = await fetchAsJpgBuffer(url);
    const image = await pdfDoc.embedJpg(imageBuffer);

    const displayWidth = image.width / CONFIG.SCALE; // Adjust width based on scale factor
    const displayHeight = image.height / CONFIG.SCALE; // Adjust height based on scale factor

    const page = pdfDoc.addPage([displayWidth, displayHeight]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: displayWidth,
      height: displayHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const strictBytes = new Uint8Array(pdfBytes); // Re-wrapper to fix SharedArrayBuffer issues in some browsers
  // Note: This is a workaround for a known issue in some browsers where the PDF bytes are in a SharedArrayBuffer, which is not allowed in some contexts.

  const blob = new Blob([strictBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = blobUrl;
  anchor.download = `${nameOfSheet.replace(/\//g, " ")}.pdf`;

  // Use the Chrome Downloads API to save to the user's machine
  document.body.appendChild(anchor);
  anchor.click();

  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl); // Clean up the blob URL
}

/**
 * Fetches an image from a given URL and returns it as an ArrayBuffer in JPEG format.
 * @param url The URL of the image to fetch.
 * @returns A promise that resolves to an ArrayBuffer containing the JPEG image data.
 */
async function fetchAsJpgBuffer(url: string): Promise<ArrayBuffer> {
  const response = await chrome.runtime.sendMessage({
    action: "FETCH_IMAGE",
    url,
  });

  if (!response.success)
    throw new Error(`Failed to fetch image: ${response.error}`);

  const buffer = new Uint8Array(response.array).buffer;
  const contentType = response.contentType || "";

  if (url.includes(".svg") || contentType.includes("image/svg+xml")) {
    const svgText = new TextDecoder("utf-8").decode(buffer);

    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgBlob = new Blob([svgText], {
        type: "image/svg+xml;charset=utf-8",
      });
      const blobUrl = URL.createObjectURL(svgBlob);

      img.onload = () => {
        // Default A4 dimensions in pixels at 96 DPI: 827 x 1170
        const canvas = document.createElement("canvas");
        const basewidth = img.width || 827;
        const baseheight = img.height || 1170;

        canvas.width = basewidth * CONFIG.SCALE;
        canvas.height = baseheight * CONFIG.SCALE;

        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Failed to get canvas context");

        // Fill white background to prevent transparent PDFs
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(CONFIG.SCALE, CONFIG.SCALE);

        ctx.drawImage(img, 0, 0, basewidth, baseheight);

        URL.revokeObjectURL(blobUrl);

        canvas.toBlob(
          async (blob) => {
            if (blob) resolve(await blob.arrayBuffer());
            else reject(new Error("Canvas to Blob conversion failed"));
          },
          "image/jpeg",
          CONFIG.CANVAS_TO_BLOB_QUALITY,
        );
      };

      img.onerror = reject;
      img.src = blobUrl;
    });
  }

  // If it's already a PNG, just return the buffer
  return buffer;
}

/**
 * Finds the first image element with an alt attribute that includes "Sheet Music arranged by" and returns its class name.
 * @returns The class name of the first matching image element, or an empty string if none is found.
 */
function findSheetClass(): string {
  const imgCollection = Array.from(document.querySelectorAll("img"));
  const imgObj = imgCollection.find((img) =>
    img.alt.includes("Sheet Music arranged by"),
  );
  if (!imgObj) throw new Error("No sheet music found");
  return imgObj.className;
}

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "GET_TITLE") {
    const titleNodes = document.querySelectorAll("h1");
    const title =
      titleNodes.length > 0 ? titleNodes[0].innerText : "Unknown Sheet";
    sendResponse({ title });
  } else if (request.action === "START_SCRAPING") {
    startProcess();
    sendResponse({ status: "started" });
  }

  return false; // Keeps the message channel open if needed
});

/**
 * Starts the scraping process by finding the sheet class, scraping the sheet info, generating a PDF, and triggering the download.
 * @returns
 */
async function startProcess() {
  try {
    console.log("Starting scraping process...");
    CONFIG.SHEET_CLASS = findSheetClass();
    const { list, sheetName } = await scrapeSheetInfo();

    if (list.length === 0) {
      console.error("No images found to download.");
      return;
    }

    console.log(`Building PDF with ${list.length} images...`);
    await generateAndDownloadPDF(list, sheetName);

    console.log("Download triggered successfully.");
  } catch (err) {
    console.error("Error during scraping process:", err);
  }
}
