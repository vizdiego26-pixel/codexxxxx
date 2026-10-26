#!/usr/bin/env python3
"""Build the offline Android edition using official SDK tools, without Gradle.

Run npm run build first, then python scripts/build-android.py.
SDK downloads and signing material remain outside the checkout under /workspace.
The signing key must be preserved to allow users to install future app updates.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SDK = Path(os.environ.get('LAMINA_ANDROID_SDK', '/workspace/lamina-android-sdk'))
SIGNING = Path(os.environ.get('LAMINA_ANDROID_SIGNING', '/workspace/.lamina-signing'))
BUILD = ROOT / '.android-build'
RELEASES = ROOT / 'releases'
ARTIFACTS = [
    ('platform', 'https://dl.google.com/android/repository/platform-35_r02.zip', '0bb560a90a7a2cbd0dd8348224d518b638fe7949', 'platform-35_r02.zip'),
    ('build-tools', 'https://dl.google.com/android/repository/build-tools_r35_linux.zip', '2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc', 'build-tools_r35_linux.zip'),
    ('ecj', 'https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar', 'da787c5669578ffd5324bf29c18b361904a5a1bb', 'ecj-3.39.0.jar'),
]


def run(args: list[str | Path], **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def checksum(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download(artifact):
    name, url, expected, filename = artifact
    destination = SDK / 'downloads' / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and checksum(destination) == expected:
        print(f'{name}: verified cached artifact.', flush=True)
        return name, destination
    temporary = destination.with_suffix(destination.suffix + '.partial')
    print(f'{name}: downloading official artifact over verified HTTPS…', flush=True)
    try:
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if checksum(temporary) != expected:
            raise RuntimeError(f'Integrity check failed for {filename}; refusing to use it.')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'{name}: SHA-1 matches official repository metadata.', flush=True)
    return name, destination


def safe_extract(archive: Path, destination: Path):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            resolved = (destination / item.filename).resolve()
            if not resolved.is_relative_to(destination.resolve()):
                raise RuntimeError(f'Unsafe archive member in {archive.name}.')
        package.extractall(destination)
        for item in package.infolist():
            mode = item.external_attr >> 16
            target = destination / item.filename
            if mode & 0o111 and target.is_file():
                target.chmod(target.stat().st_mode | 0o111)


def prepare_tools():
    SDK.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        paths = dict(executor.map(download, ARTIFACTS))
    for name in ['platform', 'build-tools']:
        folder = SDK / name
        marker = folder / '.verified-sha1'
        expected = next(artifact[2] for artifact in ARTIFACTS if artifact[0] == name)
        if not marker.is_file() or marker.read_text().strip() != expected:
            if folder.exists():
                shutil.rmtree(folder)
            safe_extract(paths[name], folder)
            marker.write_text(expected + '\n')
    android_jar = next((SDK / 'platform').rglob('android.jar'))
    tool_folder = next((SDK / 'build-tools').rglob('aapt2')).parent
    for name in ['aapt2', 'd8', 'zipalign', 'apksigner']:
        tool = tool_folder / name
        if not tool.is_file():
            raise RuntimeError(f'Official build tool missing: {name}')
        tool.chmod(tool.stat().st_mode | 0o111)
    return android_jar, tool_folder, paths['ecj']


def signing_files():
    SIGNING.mkdir(parents=True, exist_ok=True, mode=0o700)
    SIGNING.chmod(0o700)
    password = SIGNING / 'password.txt'
    keystore = SIGNING / 'lamina-release.p12'
    if password.exists() != keystore.exists():
        raise RuntimeError('Signing material is incomplete. Restore the ORIGINAL keystore and its password securely; a replacement key cannot update the installed app.')
    if not password.exists():
        if '--init-signing' not in sys.argv:
            raise RuntimeError('Signing material is missing. Restore /workspace/.lamina-signing to update the existing app. Only for the FIRST release, explicitly use --init-signing to create its signing identity.')
        fd = os.open(password, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(secrets.token_urlsafe(36) + '\n')
        run(['keytool', '-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', keystore,
             '-storepass:file', password, '-keypass:file', password, '-alias', 'lamina', '-keyalg', 'RSA',
             '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Lamina Study, OU=Offline app, O=Lamina'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    password.chmod(0o600)
    keystore.chmod(0o600)
    return keystore, password


def extract_assets():
    package_path = RELEASES / 'Lamina-Android.zip'
    if not package_path.is_file():
        raise RuntimeError('releases/Lamina-Android.zip is missing. Run npm run build first.')
    assets = BUILD / 'assets'
    assets.mkdir(parents=True)
    with zipfile.ZipFile(package_path) as package:
        for name in ['Lamina.html', 'pauta.pdf']:
            data = package.read(name)
            (assets / name).write_bytes(data)
    return assets


def main():
    for command in ['java', 'keytool']:
        if not shutil.which(command):
            raise RuntimeError(f'{command} is required (OpenJDK 21 recommended).')
    android_jar, tools, ecj = prepare_tools()
    if '--prepare-tools' in sys.argv:
        print(f'Android SDK tools ready in {SDK}.', flush=True)
        return
    manifest = ROOT / 'android/AndroidManifest.xml'
    resources = ROOT / 'android/res'
    sources = sorted((ROOT / 'android/src').rglob('*.java'))
    if not manifest.is_file() or not sources:
        raise RuntimeError('Android manifest and Java sources are missing.')
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir()
    assets = extract_assets()
    classes, dex = BUILD / 'classes', BUILD / 'dex'
    classes.mkdir()
    dex.mkdir()
    compiled_resources = BUILD / 'resources.zip'
    print('Compiling Android resources and Java wrapper…', flush=True)
    run([tools / 'aapt2', 'compile', '--dir', resources, '-o', compiled_resources])
    unsigned = BUILD / 'unsigned.apk'
    run([tools / 'aapt2', 'link', '-o', unsigned, '--manifest', manifest, '-I', android_jar,
         '--min-sdk-version', '26', '--target-sdk-version', '34', '--version-code', '1',
         '--version-name', '1.0', '-A', assets, compiled_resources])
    run(['java', '-jar', ecj, '-8', '-encoding', 'UTF-8', '-bootclasspath', android_jar,
         '-d', classes, *sources])
    classes_jar = BUILD / 'classes.jar'
    with zipfile.ZipFile(classes_jar, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in classes.rglob('*.class'):
            archive.write(path, path.relative_to(classes))
    run([tools / 'd8', '--lib', android_jar, '--min-api', '26', '--output', dex, classes_jar])
    with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED) as archive:
        for path in dex.glob('*.dex'):
            archive.write(path, path.name)
    aligned = BUILD / 'aligned.apk'
    run([tools / 'zipalign', '-f', '-p', '4', unsigned, aligned])
    keystore, password = signing_files()
    RELEASES.mkdir(exist_ok=True)
    output = RELEASES / 'Lamina-Android.apk'
    print('Signing APK with the preserved local app key…', flush=True)
    run([tools / 'apksigner', 'sign', '--ks', keystore, '--ks-key-alias', 'lamina',
         '--ks-pass', f'file:{password}',
         '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
         '--v3-signing-enabled', 'true', '--out', output, aligned])
    run([tools / 'zipalign', '-c', '4', output])
    run([tools / 'apksigner', 'verify', '--verbose', '--print-certs', output])
    run([tools / 'aapt2', 'dump', 'badging', output])
    with zipfile.ZipFile(output) as archive:
        required = {'AndroidManifest.xml', 'classes.dex', 'assets/Lamina.html', 'assets/pauta.pdf'}
        if not required <= set(archive.namelist()) or archive.testzip() is not None:
            raise RuntimeError('APK is missing required app assets or has a corrupt archive.')
    print(f'Built and verified {output} ({output.stat().st_size:,} bytes).', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, StopIteration) as error:
        print(f'Android build failed: {error}', file=sys.stderr)
        raise SystemExit(1)
