#!/usr/bin/env python3
"""
Plugin Configuration Management

Load, save, and validate plugin configurations for the Algo Trader system.
Supports YAML and JSON formats with Pydantic validation.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml


class PluginConfigError(Exception):
    """Base exception for plugin configuration errors."""
    pass


class PluginConfigValidationError(PluginConfigError):
    """Raised when plugin configuration validation fails."""
    pass


class PluginConfigLoadError(PluginConfigError):
    """Raised when plugin configuration loading fails."""
    pass


class PluginConfigSaveError(PluginConfigError):
    """Raised when plugin configuration saving fails."""
    pass


@dataclass
class PluginConfig:
    """
    Plugin configuration data class.

    Attributes:
        name: Plugin name (required)
        enabled: Whether plugin is enabled (default: True)
        priority: Plugin execution priority (lower = higher priority, default: 100)
        config: Plugin-specific configuration dictionary
        secrets: Sensitive configuration (not serialized to disk)
    """
    name: str
    enabled: bool = True
    priority: int = 100
    config: dict[str, Any] = field(default_factory=dict)
    secrets: dict[str, Any] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        """Validate configuration after initialization."""
        self.validate()

    def validate(self) -> list[str]:
        """
        Validate plugin configuration.

        Returns:
            List of validation error messages (empty if valid)

        Raises:
            PluginConfigValidationError: If configuration is invalid
        """
        errors: list[str] = []

        # Name validation
        if not self.name or not isinstance(self.name, str):
            errors.append("Plugin name must be a non-empty string")
        elif len(self.name) > 100:
            errors.append(f"Plugin name too long: {len(self.name)} chars (max 100)")
        elif not all(c.isalnum() or c in '-_.' for c in self.name):
            errors.append(f"Plugin name contains invalid characters: {self.name}")

        # Priority validation
        if not isinstance(self.priority, int):
            errors.append(f"Priority must be an integer, got {type(self.priority)}")
        elif self.priority < 0 or self.priority > 10000:
            errors.append(f"Priority must be 0-10000, got {self.priority}")

        # Config validation
        if not isinstance(self.config, dict):
            errors.append(f"Config must be a dictionary, got {type(self.config)}")

        # Secrets validation
        if not isinstance(self.secrets, dict):
            errors.append(f"Secrets must be a dictionary, got {type(self.secrets)}")

        if errors:
            raise PluginConfigValidationError("; ".join(errors))

        return errors

    def to_dict(self, include_secrets: bool = False) -> dict[str, Any]:
        """
        Convert to dictionary representation.

        Args:
            include_secrets: Whether to include secrets (default: False)

        Returns:
            Dictionary representation of configuration
        """
        result = {
            "name": self.name,
            "enabled": self.enabled,
            "priority": self.priority,
            "config": self.config,
        }

        if include_secrets and self.secrets:
            result["secrets"] = self.secrets

        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PluginConfig":
        """
        Create PluginConfig from dictionary.

        Args:
            data: Dictionary with plugin configuration

        Returns:
            PluginConfig instance

        Raises:
            PluginConfigValidationError: If configuration is invalid
        """
        if not isinstance(data, dict):
            raise PluginConfigValidationError("Configuration must be a dictionary")

        return cls(
            name=data.get("name", ""),
            enabled=data.get("enabled", True),
            priority=data.get("priority", 100),
            config=data.get("config", {}),
            secrets=data.get("secrets", {}),
        )


@dataclass
class PluginRegistry:
    """
    Registry of multiple plugin configurations.

    Attributes:
        plugins: Dictionary of plugin name -> PluginConfig
        version: Registry version for migration support
    """
    plugins: dict[str, PluginConfig] = field(default_factory=dict)
    version: int = 1

    def add(self, config: PluginConfig) -> None:
        """Add or update a plugin configuration."""
        self.plugins[config.name] = config

    def remove(self, name: str) -> bool:
        """Remove a plugin configuration by name."""
        if name in self.plugins:
            del self.plugins[name]
            return True
        return False

    def get(self, name: str) -> Optional[PluginConfig]:
        """Get a plugin configuration by name."""
        return self.plugins.get(name)

    def list_enabled(self) -> list[PluginConfig]:
        """List all enabled plugins sorted by priority."""
        return sorted(
            [p for p in self.plugins.values() if p.enabled],
            key=lambda p: p.priority
        )

    def list_all(self) -> list[PluginConfig]:
        """List all plugins sorted by priority."""
        return sorted(self.plugins.values(), key=lambda p: p.priority)

    def to_dict(self, include_secrets: bool = False) -> dict[str, Any]:
        """Convert registry to dictionary."""
        return {
            "version": self.version,
            "plugins": [
                p.to_dict(include_secrets=include_secrets)
                for p in self.plugins.values()
            ],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PluginRegistry":
        """Create registry from dictionary."""
        if not isinstance(data, dict):
            raise PluginConfigValidationError("Registry data must be a dictionary")

        registry = cls(version=data.get("version", 1))

        plugins_data = data.get("plugins", [])
        if isinstance(plugins_data, list):
            for plugin_data in plugins_data:
                config = PluginConfig.from_dict(plugin_data)
                registry.add(config)
        elif isinstance(plugins_data, dict):
            for name, plugin_data in plugins_data.items():
                if isinstance(plugin_data, dict):
                    plugin_data["name"] = name
                    config = PluginConfig.from_dict(plugin_data)
                    registry.add(config)

        return registry

    def validate_all(self) -> dict[str, list[str]]:
        """
        Validate all plugins in registry.

        Returns:
            Dictionary of plugin_name -> list of validation errors
        """
        errors: dict[str, list[str]] = {}

        for name, config in self.plugins.items():
            try:
                config.validate()
            except PluginConfigValidationError as e:
                errors[name] = [str(e)]

        return errors


class PluginConfigManager:
    """
    Manager for loading and saving plugin configurations.

    Supports YAML and JSON formats with automatic format detection.
    """

    YAML_EXTENSIONS = {".yaml", ".yml"}
    JSON_EXTENSIONS = {".json"}

    def __init__(self, config_dir: Optional[str | Path] = None):
        """
        Initialize plugin configuration manager.

        Args:
            config_dir: Directory to store configurations (default: ./config/plugins)
        """
        if config_dir:
            self.config_dir = Path(config_dir)
        else:
            self.config_dir = Path.cwd() / "config" / "plugins"

        self.config_dir.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, name: str, extension: str = ".yaml") -> Path:
        """Get full file path for a plugin configuration."""
        safe_name = name.replace("/", "_").replace("\\", "_")
        return self.config_dir / f"{safe_name}{extension}"

    def _detect_format(self, path: Path) -> str:
        """Detect file format from extension."""
        if path.suffix in self.YAML_EXTENSIONS:
            return "yaml"
        elif path.suffix in self.JSON_EXTENSIONS:
            return "json"
        else:
            return "yaml"  # Default to YAML

    def load(self, name: str) -> PluginConfig:
        """
        Load a plugin configuration from file.

        Args:
            name: Plugin name (also used as filename)

        Returns:
            Loaded PluginConfig

        Raises:
            PluginConfigLoadError: If file cannot be loaded
            PluginConfigValidationError: If configuration is invalid
        """
        file_path = self._get_file_path(name)

        # Try YAML first, then JSON
        for extension in [".yaml", ".yml", ".json"]:
            test_path = self._get_file_path(name, extension)
            if test_path.exists():
                file_path = test_path
                break

        if not file_path.exists():
            raise PluginConfigLoadError(f"Configuration file not found: {file_path}")

        try:
            content = file_path.read_text(encoding="utf-8")
            fmt = self._detect_format(file_path)

            if fmt == "yaml":
                data = yaml.safe_load(content)
            else:
                data = json.loads(content)

            if not isinstance(data, dict):
                raise PluginConfigLoadError(
                    f"Invalid configuration format in {file_path}: expected dict"
                )

            return PluginConfig.from_dict(data)

        except yaml.YAMLError as e:
            raise PluginConfigLoadError(f"YAML parse error in {file_path}: {e}")
        except json.JSONDecodeError as e:
            raise PluginConfigLoadError(f"JSON parse error in {file_path}: {e}")
        except OSError as e:
            raise PluginConfigLoadError(f"Cannot read file {file_path}: {e}")

    def save(
        self,
        config: PluginConfig,
        name: Optional[str] = None,
        fmt: str = "yaml",
        include_secrets: bool = False,
    ) -> Path:
        """
        Save a plugin configuration to file.

        Args:
            config: PluginConfig to save
            name: Optional name override (default: use config.name)
            fmt: File format - "yaml" or "json" (default: "yaml")
            include_secrets: Whether to include secrets in file (default: False)

        Returns:
            Path to saved file

        Raises:
            PluginConfigSaveError: If file cannot be saved
            PluginConfigValidationError: If configuration is invalid
        """
        # Validate before saving
        config.validate()

        plugin_name = name or config.name
        file_path = self._get_file_path(plugin_name, f".{fmt}")

        try:
            data = config.to_dict(include_secrets=include_secrets)

            if fmt == "yaml":
                content = yaml.dump(
                    data,
                    default_flow_style=False,
                    allow_unicode=True,
                    sort_keys=False,
                )
            else:
                content = json.dumps(data, indent=2, ensure_ascii=False)

            # Write atomically
            temp_path = file_path.with_suffix(file_path.suffix + ".tmp")
            temp_path.write_text(content, encoding="utf-8")
            temp_path.replace(file_path)

            return file_path

        except OSError as e:
            raise PluginConfigSaveError(f"Cannot save file {file_path}: {e}")

    def load_registry(self, filename: str = "plugins.yaml") -> PluginRegistry:
        """
        Load a registry of multiple plugins from a single file.

        Args:
            filename: Registry filename (default: "plugins.yaml")

        Returns:
            Loaded PluginRegistry

        Raises:
            PluginConfigLoadError: If file cannot be loaded
        """
        file_path = self.config_dir / filename

        if not file_path.exists():
            return PluginRegistry()  # Return empty registry

        try:
            content = file_path.read_text(encoding="utf-8")
            fmt = self._detect_format(file_path)

            if fmt == "yaml":
                data = yaml.safe_load(content)
            else:
                data = json.loads(content)

            return PluginRegistry.from_dict(data or {})

        except yaml.YAMLError as e:
            raise PluginConfigLoadError(f"YAML parse error in {file_path}: {e}")
        except json.JSONDecodeError as e:
            raise PluginConfigLoadError(f"JSON parse error in {file_path}: {e}")
        except OSError as e:
            raise PluginConfigLoadError(f"Cannot read file {file_path}: {e}")

    def save_registry(
        self,
        registry: PluginRegistry,
        filename: str = "plugins.yaml",
        fmt: str = "yaml",
    ) -> Path:
        """
        Save a registry of multiple plugins to a single file.

        Args:
            registry: PluginRegistry to save
            filename: Registry filename (default: "plugins.yaml")
            fmt: File format - "yaml" or "json" (default: "yaml")

        Returns:
            Path to saved file

        Raises:
            PluginConfigSaveError: If file cannot be saved
        """
        file_path = self.config_dir / f"{filename}"

        # Validate all plugins before saving
        errors = registry.validate_all()
        if errors:
            error_msgs = [f"{name}: {errs}" for name, errs in errors.items()]
            raise PluginConfigValidationError("; ".join(error_msgs))

        try:
            data = registry.to_dict()

            if fmt == "yaml":
                content = yaml.dump(
                    data,
                    default_flow_style=False,
                    allow_unicode=True,
                    sort_keys=False,
                )
            else:
                content = json.dumps(data, indent=2, ensure_ascii=False)

            # Write atomically
            temp_path = file_path.with_suffix(file_path.suffix + ".tmp")
            temp_path.write_text(content, encoding="utf-8")
            temp_path.replace(file_path)

            return file_path

        except OSError as e:
            raise PluginConfigSaveError(f"Cannot save file {file_path}: {e}")

    def delete(self, name: str) -> bool:
        """
        Delete a plugin configuration file.

        Args:
            name: Plugin name

        Returns:
            True if deleted, False if file didn't exist
        """
        deleted = False

        for extension in [".yaml", ".yml", ".json"]:
            file_path = self._get_file_path(name, extension)
            if file_path.exists():
                file_path.unlink()
                deleted = True

        return deleted

    def list_configs(self) -> list[str]:
        """
        List all available plugin configuration names.

        Returns:
            List of plugin names (without extensions)
        """
        names = set()

        if self.config_dir.exists():
            for ext in [".yaml", ".yml", ".json"]:
                for file_path in self.config_dir.glob(f"*{ext}"):
                    if file_path.stem != "plugins":  # Skip registry file
                        names.add(file_path.stem)

        return sorted(names)


# Convenience functions
def load_plugin(name: str, config_dir: Optional[str] = None) -> PluginConfig:
    """Load a plugin configuration."""
    manager = PluginConfigManager(config_dir)
    return manager.load(name)


def save_plugin(
    config: PluginConfig,
    name: Optional[str] = None,
    config_dir: Optional[str] = None,
    fmt: str = "yaml",
) -> Path:
    """Save a plugin configuration."""
    manager = PluginConfigManager(config_dir)
    return manager.save(config, name=name, fmt=fmt)


def load_plugins(config_dir: Optional[str] = None) -> PluginRegistry:
    """Load all plugin configurations."""
    manager = PluginConfigManager(config_dir)
    return manager.load_registry()


def save_plugins(
    registry: PluginRegistry,
    config_dir: Optional[str] = None,
    fmt: str = "yaml",
) -> Path:
    """Save all plugin configurations."""
    manager = PluginConfigManager(config_dir)
    return manager.save_registry(registry)
