# BiO _"Breaking Into Opera"_

----

Have you ever wanted to see how Chrome developed they're console and "Developer Tools"? Well, here's most of the code they used, and images.

# How-To

For now, the only available option is to open ```dev-tools/inspector.html``` and use the tabs. I'm working on wnabling the loaded features, as well as loading several that are missing.

# File Setup

- ```dev-tools/```
  - ```chrome-extension/``` __This holds AdBlock__
    - ```oidhhegpmlfpoeialbgcdocjalghfpkp/```
      - ```ext/```
        - ```common.js```
        - ```content.js```
        - ```devtools.js```
      - ```icons/```
        - ```detailed/```
          - ```adp-48.png``` __AdBlock Icon (48 x 48)__
      - ```skin/```
        - ```devtools-panel.css```
      - ```devtools.html``` __AdBlock's HTML__
      - ```devtools.js``` __AdBlock's JavaScript__
      - ```devtools-panel.html```
      - ```devtools-panel.js```
  - ```Images/```
    - ```chromeDisabledSelect.png``` __Chevron down icon used by the _Settings_ window__
    - ```chromeSelect.png``` __Chevron down icon used by the _Settings_ window__
    - ```radioDot.png``` __Radio dot used by several tabs__
    - ```resourcesTimeGraphIcon.png``` __Clock icon used by the _Audits_ tab__
    - ```securityStateInsecure.png``` __Couldn't load the ```.svg``` so substituted for ```.png```__
    - ```securityStateNeutral.png``` __Couldn't load the ```.svg``` so substituted for ```.png```__
    - ```securityStateSecure.png``` __Couldn't load the ```.svg``` so substituted for ```.png```__
    - ```toolbarButtonGlyphs.png``` __matrix of ```.png``` icons__
  - ```inspector.html``` __The HTML code of the actual _Developer Tools_ page__
  - ```inspector.js``` __The initial JavaScript code__
  - ```accessibility_module.js```
  - ```animation_module.js```
  - ```audits_module.js```
  - ```components_lazy_module.js```
  - ```console_module.js```
  - ```devices_module.js```
  - ```diff_module.js```
  - ```elements_module.js```
  - ```es_tree_module.js```
  - ```layers_module.js```
  - ```network_module.js```
  - ```profiler_module.js```
  - ```resources_frame_module.js```
  - ```sass_module.js```
  - ```security_module.js```
  - ```settings_module.js```
  - ```snippets_module.js```
  - ```source_frame_module.js```
  - ```sources_module.js```
  - ```timeline_model_module.js```
  - ```timeline_module.js```
  - ```ui_lazy_module.js```

# Missing Modules/Scripts

Likely hiding at ```chrome-devtools://devtools/bundled/{Module Name}_module.js```

- bindings
- cm_modes
- common
- components
- emulated_devices
- emulation
- extensions
- host
- main
- platfrom
- resources
- screencast
- sdk
- ui
- workspace
