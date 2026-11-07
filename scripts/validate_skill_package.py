#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_skill_package.py —— WorkBuddy 技能包打包前门禁校验

起因：ltzzz-source-check v1.0.0 首次提交因 examples_zh 2 条 / examples_en 1 条
被平台判为解析失败。人工只核了"文件齐不齐 + frontmatter 必填项有没有"，
漏了"成对字段数量必须一致"。本脚本把这条变成机器门禁，以后打包前必跑。

用法：
    python3 validate_skill_package.py <技能包目录>          # 只校验
    python3 validate_skill_package.py <技能包目录> --zip    # 校验通过后打包到当前目录
    python3 validate_skill_package.py --all products/workbuddy   # 批量校验某目录下所有包

退出码：0 = 通过；1 = 有错；2 = 用法错误
仅用标准库，不依赖 pyyaml。
"""

import os
import re
import sys
import zipfile
import datetime

REQUIRED_SCALARS = ["name", "display_name", "description", "version", "author"]
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
# 平台强制：形如 xxx_zh / xxx_en 的成对列表字段，条数必须相等
PAIR_SUFFIXES = ("_zh", "_en")
JUNK_FILES = {"__pycache__", ".DS_Store", "Thumbs.db"}
JUNK_SUFFIX = (".pyc",)


class Report:
    def __init__(self, pkg):
        self.pkg = pkg
        self.errors = []
        self.warns = []
        self.infos = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warns.append(msg)

    def info(self, msg):
        self.infos.append(msg)

    @property
    def ok(self):
        return not self.errors


def parse_frontmatter(text):
    """极简 YAML 子集解析：只支持 `key: value` 与 `key:` + `- item` 列表。"""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, "SKILL.md 首行不是 `---`，缺少 frontmatter"
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return None, "frontmatter 未以 `---` 闭合"

    data = {}
    cur = None
    for raw in lines[1:end]:
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        m_item = re.match(r"^\s*-\s+(.*)$", line)
        if m_item:
            if cur is None:
                continue
            val = m_item.group(1).strip().strip('"').strip("'")
            if isinstance(data.get(cur), str):
                data[cur] = [data[cur]]
            data[cur].append(val)
            continue
        m_key = re.match(r"^([A-Za-z0-9_\-]+)\s*:\s*(.*)$", line)
        if m_key:
            key, val = m_key.group(1), m_key.group(2).strip()
            cur = key
            if val == "":
                data[key] = []
            else:
                data[key] = val.strip('"').strip("'")
    return data, None


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def validate(pkg_dir):
    r = Report(pkg_dir)
    if not os.path.isdir(pkg_dir):
        r.err("不是目录：%s" % pkg_dir)
        return r

    skill_md = os.path.join(pkg_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        r.err("缺少必需文件 SKILL.md")
        return r

    with open(skill_md, "r", encoding="utf-8") as f:
        text = f.read()
    fm, why = parse_frontmatter(text)
    if fm is None:
        r.err(why)
        return r

    # 1) 必填标量
    for k in REQUIRED_SCALARS:
        if k not in fm or (isinstance(fm[k], list) and not fm[k]) or fm[k] == "":
            r.err("frontmatter 缺必需字段或为空：%s" % k)
    if "version" in fm:
        v = fm["version"] if isinstance(fm["version"], str) else ""
        if not VERSION_RE.match(v.strip()):
            r.err("version 不是 x.y.z 形式：%r" % v)
    if "author" in fm:
        author = fm["author"] if isinstance(fm["author"], str) else ""
        if not author.strip():
            r.err("author 为空")
        elif author.strip().startswith("LTZZZ") or "AI" in author:
            r.warn("author 疑似仍为团队/AI 名称，企业主体应填营业执照全称：%r" % author)

    # 2) 成对字段数量一致（本次事故的门禁点）
    pair_checked = False
    for key in list(fm.keys()):
        if key.endswith(PAIR_SUFFIXES[0]):
            base = key[: -len(PAIR_SUFFIXES[0])]
            en_key = base + PAIR_SUFFIXES[1]
            if en_key not in fm:
                r.err("成对字段缺失：有 %s 但没有 %s" % (key, en_key))
                continue
            zh_n, en_n = len(as_list(fm[key])), len(as_list(fm[en_key]))
            pair_checked = True
            if zh_n != en_n:
                r.err("成对字段数量不一致：%s=%d 条，%s=%d 条（平台强制相等）"
                      % (key, zh_n, en_key, en_n))
            elif zh_n == 0:
                r.err("成对字段为空：%s / %s" % (key, en_key))
    if not pair_checked:
        r.warn("未发现任何 _zh/_en 成对字段；若平台要求双语示例，请补齐")

    # 3) 正文引用的 @路径 必须存在
    for ref in re.findall(r"@((?:references|templates|scripts)/[A-Za-z0-9_\-./]+)", text):
        target = os.path.join(pkg_dir, ref)
        if not os.path.exists(target):
            r.err("正文引用了不存在的文件：@%s" % ref)
        else:
            r.info("引用 OK：@%s" % ref)

    # 4) 目录卫生
    for root, dirs, files in os.walk(pkg_dir):
        for d in list(dirs):
            if d in JUNK_FILES:
                r.err("打包目录含垃圾目录：%s" % os.path.join(root, d))
        for fn in files:
            if fn in JUNK_FILES or fn.endswith(JUNK_SUFFIX):
                r.err("打包目录含垃圾文件：%s" % os.path.join(root, fn))

    # 5) 结构摘要
    size = 0
    for root, _, files in os.walk(pkg_dir):
        for fn in files:
            size += os.path.getsize(os.path.join(root, fn))
    r.info("包内文件 %d 个，合计 %d B" % (
        sum(len(f) for _, _, f in os.walk(pkg_dir)), size))
    r.info("name=%s version=%s author=%s" % (
        fm.get("name", "?"), fm.get("version", "?"), fm.get("author", "?")))
    return r


def make_zip(pkg_dir, out_dir="."):
    base = os.path.basename(os.path.normpath(pkg_dir))
    fm, _ = parse_frontmatter(
        open(os.path.join(pkg_dir, "SKILL.md"), "r", encoding="utf-8").read())
    ver = (fm or {}).get("version", "0.0.0")
    out = os.path.join(out_dir, "%s-%s.zip" % (base, ver))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(pkg_dir):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, pkg_dir)
                z.write(full, arc)
    return out


def main(argv):
    args = [a for a in argv[1:]]
    do_zip = "--zip" in args
    args = [a for a in args if a != "--zip"]
    if not args:
        sys.stderr.write(__doc__)
        return 2

    targets = []
    if args[0] == "--all":
        root = args[1] if len(args) > 1 else "."
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if os.path.isfile(os.path.join(p, "SKILL.md")):
                targets.append(p)
        if not targets:
            sys.stderr.write("在 %s 下没有找到任何含 SKILL.md 的包\n" % root)
            return 2
    else:
        targets.append(args[0])

    bad = 0
    for pkg in targets:
        r = validate(pkg)
        print("=" * 60)
        print("包：%s" % pkg)
        for m in r.infos:
            print("  · %s" % m)
        for m in r.warns:
            print("  ! 警告 %s" % m)
        for m in r.errors:
            print("  x 错误 %s" % m)
        print("  结果：%s" % ("通过" if r.ok else "不通过，禁止打包"))
        if not r.ok:
            bad += 1
            continue
        if do_zip:
            out = make_zip(pkg)
            print("  已打包：%s (%d B)" % (out, os.path.getsize(out)))

    print("=" * 60)
    print("校验 %d 个包，失败 %d 个 —— %s" % (
        len(targets), bad, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
