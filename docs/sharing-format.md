# Sharing format

> **Status: phase 6.** This document is completed when the implementation
> lands.

Recipes move between separate deployments through a versioned portable JSON
bundle rather than any database-level mechanism, because instances are
independent installations with no shared storage.

A bundle carries the recipe, its ingredients **with resolved USDA identifiers
and macro snapshots**, its steps, and category and tag *names* rather than
identifiers. Carrying the resolutions means an importing instance has correct
nutrition immediately, with no USDA or model calls.
