include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-caddy
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-caddy
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Caddy service management
  DEPENDS:=+luci-base +caddy-binary +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-ubus
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-caddy/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
fi
exit 0
endef

define Package/luci-app-caddy/install
	$(CP) ./root/* $(1)/
	$(INSTALL_DIR) $(1)/www
	$(CP) ./htdocs/* $(1)/www/
endef

$(eval $(call BuildPackage,luci-app-caddy))
