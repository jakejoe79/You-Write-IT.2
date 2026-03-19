#!/usr/bin/env python3
"""
epub_builder.py — builds an EPUB from stdin content
Usage: python epub_builder.py --title "My Book" --author "Author" --output out.epub
Content is read from stdin (piped from Node).
"""
import sys
import argparse
from ebooklib import epub

def build_epub(title, author, content, output_path):
    book = epub.EpubBook()
    book.set_title(title)
    book.set_language('en')
    book.add_author(author)

    # Split content into chapters on double newline blocks
    sections = [s.strip() for s in content.split('\n\n\n') if s.strip()]
    chapters = []

    for i, section in enumerate(sections):
        c = epub.EpubHtml(
            title=f'Chapter {i + 1}',
            file_name=f'chap_{i + 1}.xhtml',
            lang='en'
        )
        paragraphs = ''.join(f'<p>{p.strip()}</p>' for p in section.split('\n\n') if p.strip())
        c.content = f'<html><body><h2>Chapter {i + 1}</h2>{paragraphs}</body></html>'
        book.add_item(c)
        chapters.append(c)

    book.toc = tuple(chapters)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ['nav'] + chapters

    epub.write_epub(output_path, book)
    print(f'EPUB written to {output_path}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--title', default='Untitled')
    parser.add_argument('--author', default='Unknown')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    content = sys.stdin.read()
    build_epub(args.title, args.author, content, args.output)
