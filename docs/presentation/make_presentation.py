#!/usr/bin/env python3
"""Builds the 3-slide project presentation (PDF).

Usage:  python3 make_presentation.py
Needs:  matplotlib, reportlab, pillow
Inputs: stage_times.json (edit with real Jenkins timings), console.png (screenshot)
Output: Release-Console-CICD-Presentation.pdf
"""
import json
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "_build")
os.makedirs(BUILD, exist_ok=True)

INK, SLATE, LINE, MIST = "#1f2a37", "#5b6776", "#dde1e7", "#f4f6f8"
ACCENT, OK, WARN = "#2f5d7c", "#3b7a57", "#9a6a1f"

FONT_DIR = "/usr/share/fonts/truetype/liberation"
pdfmetrics.registerFont(TTFont("Serif-B", f"{FONT_DIR}/LiberationSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/LiberationSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Sans-B", f"{FONT_DIR}/LiberationSans-Bold.ttf"))
plt.rcParams["font.family"] = "Liberation Sans"

W, H = 960, 540
M = 48


# ---------------------------------------------------------------- figures
def architecture_figure(path):
    fig, ax = plt.subplots(figsize=(12, 2.5), dpi=220)
    ax.set_xlim(-1, 121); ax.set_ylim(0, 25); ax.axis("off")
    boxes = [
        ("Developer", "git push"),
        ("GitHub", "source of truth"),
        ("Jenkins", "pipeline"),
        ("Docker image", "tagged by build"),
        ("Linux server", "container on :80"),
    ]
    bw, bh, gap = 19, 11, 6.25
    x = 0
    centers = []
    for i, (title, sub) in enumerate(boxes):
        last = i == len(boxes) - 1
        face = ACCENT if last else "white"
        edge = ACCENT if last else LINE
        txt = "white" if last else INK
        ax.add_patch(FancyBboxPatch((x, 9), bw, bh, boxstyle="round,pad=0,rounding_size=1.2",
                                    fc=face, ec=edge, lw=1.4))
        ax.text(x + bw / 2, 16.2, title, ha="center", va="center", fontsize=12.5,
                fontweight="bold", color=txt)
        ax.text(x + bw / 2, 12.4, sub, ha="center", va="center", fontsize=9.5,
                color="#d7e3ec" if last else SLATE)
        centers.append((x, x + bw))
        x += bw + gap
    for (_, r), (l, _) in zip(centers[:-1], centers[1:]):
        ax.add_patch(FancyArrowPatch((r + 0.5, 14.5), (l - 0.5, 14.5), arrowstyle="-|>",
                                     mutation_scale=14, color=SLATE, lw=1.4))
    # rollback annotation beneath the last two boxes
    sx0, sx1 = centers[-1]
    mid = (sx0 + sx1) / 2
    ax.add_patch(FancyArrowPatch((mid, 8.0), (mid - 25, 8.0), arrowstyle="-|>",
                                 mutation_scale=12, color=WARN, lw=1.4))
    ax.text(mid - 12.5, 3.6, "If the new container is unhealthy, the previous one is restored",
            ha="center", va="center", fontsize=10, color=WARN)
    fig.savefig(path, bbox_inches="tight", pad_inches=0.05, transparent=True)
    plt.close(fig)


def stage_chart(path, stages):
    names = [s["name"] for s in stages][::-1]
    secs = [s["seconds"] for s in stages][::-1]
    fig, ax = plt.subplots(figsize=(6.2, 3.6), dpi=220)
    bars = ax.barh(names, secs, color=ACCENT, height=0.58)
    for b, v in zip(bars, secs):
        ax.text(v + max(secs) * 0.02, b.get_y() + b.get_height() / 2, f"{v}s",
                va="center", fontsize=10, color=INK)
    ax.set_xlim(0, max(secs) * 1.18)
    ax.tick_params(axis="y", labelsize=10.5, labelcolor=INK, length=0)
    ax.tick_params(axis="x", labelsize=9, labelcolor=SLATE, colors=LINE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(LINE)
    ax.xaxis.grid(True, color=LINE, lw=0.8); ax.set_axisbelow(True)
    ax.set_xlabel("seconds", fontsize=9.5, color=SLATE)
    fig.savefig(path, bbox_inches="tight", pad_inches=0.05, transparent=True)
    plt.close(fig)


def crop_screenshot(src, dst):
    im = Image.open(src)
    top = im.crop((70, 156, im.width - 70, 643))        # release facts + runtime
    hist = im.crop((70, 929, im.width - 70, 1168))      # deployment history
    out = Image.new("RGB", (top.width, top.height + hist.height + 14), "#f4f6f8")
    out.paste(top, (0, 0)); out.paste(hist, (0, top.height + 14))
    out.save(dst)
    return out.size


# ---------------------------------------------------------------- drawing helpers
def text(c, x, y, s, font="Sans", size=12, color=INK):
    c.setFillColor(HexColor(color)); c.setFont(font, size); c.drawString(x, y, s)


def paragraph(c, x, y, s, width, font="Sans", size=12, color=INK, leading=None):
    leading = leading or size * 1.4
    for line in simpleSplit(s, font, size, width):
        text(c, x, y, line, font, size, color)
        y -= leading
    return y


def header(c, title, subtitle, page):
    c.setFillColor(HexColor("#ffffff")); c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(HexColor(ACCENT)); c.rect(0, H - 6, W, 6, stroke=0, fill=1)
    text(c, M, H - 66, title, "Serif-B", 30)
    text(c, M, H - 92, subtitle, "Sans", 13.5, SLATE)
    c.setStrokeColor(HexColor(LINE)); c.setLineWidth(1); c.line(M, H - 108, W - M, H - 108)
    text(c, M, 24, "Release Console  |  CI/CD pipeline for a web application", "Sans", 9.5, SLATE)
    text(c, W - M - 8, 24, f"{page} / 3", "Sans", 9.5, SLATE)


def panel(c, x, y, w, h):
    c.setFillColor(HexColor("#ffffff")); c.setStrokeColor(HexColor(LINE)); c.setLineWidth(1)
    c.roundRect(x, y, w, h, 6, stroke=1, fill=1)


def tick(c, x, y, color=OK):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(1.8)
    p = c.beginPath(); p.moveTo(x, y + 3); p.lineTo(x + 3.5, y - 0.5); p.lineTo(x + 10, y + 7.5)
    c.drawPath(p, stroke=1, fill=0)


# ---------------------------------------------------------------- slides
def slide1(c, arch_png):
    header(c, "Release Console", "Automated CI/CD: from a GitHub commit to a verified deployment", 1)

    # architecture panel
    panel(c, M, 248, W - 2 * M, 164)
    img = ImageReader(arch_png); iw, ih = img.getSize()
    tw = W - 2 * M - 40; th = tw * ih / iw
    c.drawImage(img, M + 20, 248 + (164 - th) / 2, tw, th, mask="auto")

    # three columns
    cols = [
        ("The problem", [
            "Manual releases are slow, inconsistent and hard to undo.",
            "Nobody can tell which commit is running on the server.",
        ]),
        ("The solution", [
            "Every push is tested, packaged and deployed by Jenkins.",
            "A bad release is rejected or rolled back automatically.",
        ]),
        ("Tools used", [
            "Git and GitHub for source control.",
            "Docker for repeatable builds and runtime.",
            "Jenkins on Ubuntu 24.04, local VM or AWS EC2.",
        ]),
    ]
    colw = (W - 2 * M - 2 * 24) / 3
    for i, (title, items) in enumerate(cols):
        x = M + i * (colw + 24)
        text(c, x, 222, title, "Serif-B", 16)
        y = 199
        for it in items:
            c.setFillColor(HexColor(ACCENT)); c.circle(x + 3, y + 4, 2.2, stroke=0, fill=1)
            y = paragraph(c, x + 14, y, it, colw - 14, size=11.5, color=INK, leading=15.5) - 4

    # key figures
    stats = [("8", "pipeline stages"), ("10", "automated tests"), ("3", "safety nets"),
             ("0", "manual steps after git push")]
    sw = (W - 2 * M) / len(stats)
    c.setStrokeColor(HexColor(LINE)); c.line(M, 98, W - M, 98)
    for i, (n, label) in enumerate(stats):
        x = M + i * sw
        text(c, x, 54, n, "Serif-B", 30, ACCENT)
        text(c, x + 52, 58, label, "Sans", 12, SLATE)


def slide2(c, chart_png, total):
    header(c, "From commit to live in seven steps",
           f"About {total} seconds end to end (indicative), with three safety nets along the way", 2)

    panel(c, M, 70, 470, 340)
    text(c, M + 20, 384, "Time spent in each stage (indicative)", "Sans-B", 12.5)
    img = ImageReader(chart_png); iw, ih = img.getSize()
    tw = 430; th = tw * ih / iw
    c.drawImage(img, M + 20, 70 + (310 - th) / 2, tw, th, mask="auto")

    x = M + 470 + 28
    w = W - M - x
    text(c, x, 408, "Safety nets", "Serif-B", 18)
    items = [
        ("Unit tests gate the build",
         "Lint and 10 tests run inside the Docker build. A failure stops the pipeline before an image exists."),
        ("Smoke test before deploy",
         "The new image starts on a throwaway port and must answer its health check and report its own build number."),
        ("Health check and rollback",
         "The old container is kept until the new one is healthy. If not, it is restored and the attempt is logged."),
    ]
    y = 380
    for title, body in items:
        tick(c, x, y - 2)
        text(c, x + 20, y, title, "Sans-B", 12.5)
        y = paragraph(c, x + 20, y - 17, body, w - 20, size=11, color=SLATE, leading=14.5) - 16
    text(c, x, y - 4, "Finally, the live page is checked to confirm it serves the build just deployed.",
         "Sans", 11, INK)


def slide3(c, shot_png, shot_size):
    header(c, "What was delivered", "A working pipeline, and a page that proves each deployment", 3)

    sw, sh = shot_size
    boxw = 392
    boxh = boxw * sh / sw
    boxh = min(boxh, 378)
    panel(c, M, 408 - boxh - 16, boxw + 16, boxh + 16)
    c.saveState()
    p = c.beginPath(); p.roundRect(M + 8, 408 - boxh - 8, boxw, boxh, 3); c.clipPath(p, stroke=0, fill=0)
    drawh = boxw * sh / sw
    c.drawImage(ImageReader(shot_png), M + 8, 408 - boxh - 8 + boxh - drawh, boxw, drawh)
    c.restoreState()
    text(c, M, 408 - boxh - 34, "The deployed Release Console, running locally: build, health and deployment history.",
         "Sans", 9.5, SLATE)

    x = M + boxw + 16 + 32
    w = W - M - x
    text(c, x, 408, "Deliverables", "Serif-B", 18)
    deliver = [
        "GitHub repository with branching and commit conventions",
        "Dockerfile: multi-stage, non-root, health-checked",
        "Jenkinsfile: 8-stage declarative pipeline",
        "Deployment scripts with automatic rollback",
        "Deployed web application with live release history",
        "Workflow, setup and troubleshooting documentation",
    ]
    y = 382
    for d in deliver:
        tick(c, x, y - 2)
        text(c, x + 20, y, d, "Sans", 11.5)
        y -= 23

    text(c, x, y - 16, "Skills developed", "Serif-B", 16)
    skills = ["Git", "GitHub", "Linux", "Docker", "Jenkins", "CI/CD", "AWS EC2", "Troubleshooting"]
    sx, sy = x, y - 44
    c.setFont("Sans", 10)
    for s in skills:
        tw_ = c.stringWidth(s, "Sans", 10) + 18
        if sx + tw_ > W - M:
            sx = x; sy -= 28
        c.setFillColor(HexColor(MIST)); c.setStrokeColor(HexColor(LINE))
        c.roundRect(sx, sy - 5, tw_, 22, 11, stroke=1, fill=1)
        text(c, sx + 9, sy + 1, s, "Sans", 10, INK)
        sx += tw_ + 6


def main():
    with open(os.path.join(HERE, "stage_times.json")) as f:
        stages = json.load(f)["stages"]
    total = sum(s["seconds"] for s in stages)

    arch = os.path.join(BUILD, "architecture.png")
    chart = os.path.join(BUILD, "stages.png")
    shot = os.path.join(BUILD, "console_crop.png")
    architecture_figure(arch)
    stage_chart(chart, stages)
    size = crop_screenshot(os.path.join(HERE, "console.png"), shot)

    out = os.path.join(HERE, "Release-Console-CICD-Presentation.pdf")
    c = canvas.Canvas(out, pagesize=(W, H))
    c.setTitle("Release Console: CI/CD Pipeline for a Web Application")
    slide1(c, arch); c.showPage()
    slide2(c, chart, total); c.showPage()
    slide3(c, shot, size); c.showPage()
    c.save()
    print("wrote", out)


if __name__ == "__main__":
    main()
