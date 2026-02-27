# reverse-twitter-notifications

## What is This

Twitter(X) の Web Push 通知を Mozilla Autopush 経由で受信・復号し、プログラマブルな API として提供するライブラリ。API やスクレイピングを一切使わず、リアルタイムでツイート通知を取得できる。

## Who is This For

- Twitter 通知をトリガーに Bot や自動化パイプラインを構築したい開発者
- 通知データを独自のシステム (Webhook, DB, メッセージキュー等) に流したい開発者

## Problem

Twitter API は高額で制限が厳しく、スクレイピングは不安定。Web Push 通知という公式の仕組みを利用して、安定的かつ無料でリアルタイム通知を取得する手段がライブラリとして存在しない。

## Vision

コア通知受信ライブラリを安定させた上で、Webhook 連携・通知フィルタリング・複数アカウント対応などのエコシステムを拡張し、Twitter 通知を起点とした自動化の標準的なビルディングブロックになる。

## Principles

- **Zero API dependency**: Twitter API を使わない。Web Push プロトコルのみ
- **Programmable first**: CLI ではなくライブラリ。開発者が自由に組み込める
- **Minimal surface**: コア API は小さく保ち、拡張はユーザー側のコードで
- **State transparency**: 内部状態 (鍵、接続情報) をユーザーに公開し、永続化は委ねる
- **Runtime agnostic (goal)**: Web 標準 API ベースで、Bun/Node/Deno で動く方向へ
