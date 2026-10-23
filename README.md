# Gantry

Gantry is the operator console of the Shuttle gateway and the Hub access service: one web app that shows the live status of both and lets operators run Hub's admin tasks. It runs as an ordinary upstream behind Shuttle, so Shuttle handles the login and the access check and Gantry never sees a password. The build plan is the source of truth for the scope, the architecture, the security model and the milestones: [docs/plan.md](docs/plan.md).
