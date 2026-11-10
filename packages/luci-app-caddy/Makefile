include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-caddy
PKG_VERSION:=0.1.0
PKG_RELEASE:=13
PKG_LICENSE:=Apache-2.0
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-caddy
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Caddy service management
  DEPENDS:=+luci-base +caddy-binary +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-ubus +openssl-util +logd +curl
  PKGARCH:=all
endef

define Build/Compile
	$(STAGING_DIR_HOSTPKG)/bin/po2lmo ./po/zh_Hans/caddy.po $(PKG_BUILD_DIR)/caddy.zh-cn.lmo
endef

define Package/luci-app-caddy/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
	/etc/init.d/caddy-monitor enable
	/etc/init.d/caddy-monitor restart
fi
exit 0
endef

define Package/luci-app-caddy/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/caddy-monitor stop
	/etc/init.d/caddy-monitor disable
fi
exit 0
endef

define Package/luci-app-caddy/install
	$(CP) ./root/* $(1)/
	$(INSTALL_DIR) $(1)/www
	$(CP) ./htdocs/* $(1)/www/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/caddy.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n/caddy.zh-cn.lmo
endef

$(eval $(call BuildPackage,luci-app-caddy))
