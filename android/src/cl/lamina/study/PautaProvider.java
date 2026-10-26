package cl.lamina.study;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** Shares only the bundled answer key, read-only, with the user's selected PDF viewer. */
public final class PautaProvider extends ContentProvider {
    private File cachedPdf;
    @Override public boolean onCreate() { return true; }

    private void checkUri(Uri uri) {
        if (!"cl.lamina.study.documents".equals(uri.getAuthority()) || !"/pauta.pdf".equals(uri.getPath()))
            throw new IllegalArgumentException("Documento no disponible");
    }

    private synchronized File pdfFile() throws FileNotFoundException {
        if (cachedPdf != null && cachedPdf.isFile()) return cachedPdf;
        File target = new File(getContext().getCacheDir(), "lamina-pauta.pdf");
        File temporary = null;
        try {
            temporary = File.createTempFile("lamina-pauta", ".tmp", getContext().getCacheDir());
            try (InputStream source = getContext().getAssets().open("pauta.pdf");
                 FileOutputStream out = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = source.read(buffer)) != -1) out.write(buffer, 0, read);
            }
            if (!temporary.renameTo(target)) throw new IOException("No se pudo preparar la pauta");
            cachedPdf = target;
            return cachedPdf;
        } catch (IOException exception) {
            if (temporary != null) temporary.delete();
            throw new FileNotFoundException("No se pudo abrir la pauta");
        }
    }

    @Override public String getType(Uri uri) { checkUri(uri); return "application/pdf"; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        checkUri(uri);
        if (!"r".equals(mode)) throw new FileNotFoundException("El documento es de solo lectura");
        return ParcelFileDescriptor.open(pdfFile(), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        checkUri(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor result = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int index = 0; index < columns.length; index++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) row[index] = "Pauta-Lamina.pdf";
            else if (OpenableColumns.SIZE.equals(columns[index])) {
                try { row[index] = pdfFile().length(); } catch (FileNotFoundException ignored) { row[index] = 0L; }
            }
        }
        result.addRow(row);
        return result;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Solo lectura"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Solo lectura"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Solo lectura"); }
}
