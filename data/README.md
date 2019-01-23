# Data folder
Configuration folder to map with any Docker compose volume :

```yaml
volumes:
  - ".data:/usr/local/lib/node_modules/nuxeo-node-example/data"
```

**home.json** config file is created there if not exists